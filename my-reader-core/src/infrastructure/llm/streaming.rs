use eventsource_stream::{Event, EventStreamError, Eventsource};
use futures_util::{stream, Stream, StreamExt};
use reqwest::Response;
use serde_json::Value;
use tokio::time::{timeout_at, Instant};

use super::{error, map_network_error, response_text, IDLE_TIMEOUT, MAX_RESPONSE_BYTES};
use crate::{
    models::{LlmProgress, LlmProtocol, LlmStreamEvent},
    CoreError,
};

// SSE repeats metadata with every token, unlike a single JSON response.
const MAX_STREAM_BYTES: usize = MAX_RESPONSE_BYTES * 8;

pub(super) async fn read_text(
    response: Response,
    protocol: LlmProtocol,
    deadline: Instant,
    progress: Option<LlmProgress<'_>>,
) -> Result<String, CoreError> {
    let bytes = stream::try_unfold((response, 0usize), |(mut response, received)| async move {
        let Some(chunk) = response.chunk().await.map_err(map_network_error)? else {
            return Ok(None);
        };
        let received = received.saturating_add(chunk.len());
        if received > MAX_STREAM_BYTES {
            return Err(error("RESPONSE_TOO_LARGE"));
        }
        Ok(Some((chunk, (response, received))))
    });
    read_events(bytes.eventsource(), protocol, deadline, progress).await
}

async fn read_events(
    events: impl Stream<Item = Result<Event, EventStreamError<CoreError>>>,
    protocol: LlmProtocol,
    mut deadline: Instant,
    progress: Option<LlmProgress<'_>>,
) -> Result<String, CoreError> {
    futures_util::pin_mut!(events);
    let mut text = String::new();
    loop {
        let event = timeout_at(deadline, events.next())
            .await
            .map_err(|_| error("TIMEOUT"))?
            .ok_or_else(|| error("INCOMPLETE_RESPONSE"))?
            .map_err(|error_value| match error_value {
                EventStreamError::Transport(error_value) => error_value,
                _ => error("INVALID_RESPONSE"),
            })?;
        if Instant::now() >= deadline {
            return Err(error("TIMEOUT"));
        }
        if event.data.trim().is_empty() {
            continue;
        }
        if event.data.trim() == "[DONE]" {
            return Err(error("INCOMPLETE_RESPONSE"));
        }
        let value: Value =
            serde_json::from_str(&event.data).map_err(|_| error("INVALID_RESPONSE"))?;
        if value.get("error").is_some_and(|value| !value.is_null()) {
            return Err(error("GENERATION_FAILED"));
        }
        let update = match protocol {
            LlmProtocol::ChatCompletions => chat_update(&value, &mut text)?,
            LlmProtocol::Responses => responses_update(&value)?,
        };
        if let Some(progress) = progress {
            emit_deltas(protocol, &value, progress);
        }
        match update {
            Update::Content => deadline = Instant::now() + IDLE_TIMEOUT,
            Update::Complete(result) => return Ok(result),
            Update::Metadata => {}
        }
    }
}

fn emit_deltas(protocol: LlmProtocol, value: &Value, progress: LlmProgress<'_>) {
    let (reasoning, text) = match protocol {
        LlmProtocol::ChatCompletions => {
            let Some(choice) = value["choices"]
                .as_array()
                .and_then(|choices| choices.iter().find(|choice| choice["index"] == 0))
            else {
                return;
            };
            (
                &choice["delta"]["reasoning_content"],
                &choice["delta"]["content"],
            )
        }
        LlmProtocol::Responses => match value["type"].as_str() {
            Some("response.reasoning_text.delta" | "response.reasoning_summary_text.delta") => {
                (&value["delta"], &Value::Null)
            }
            Some("response.output_text.delta") => (&Value::Null, &value["delta"]),
            _ => return,
        },
    };
    if let Some(delta) = reasoning.as_str().filter(|delta| !delta.is_empty()) {
        progress(LlmStreamEvent::Reasoning(delta.into()));
    }
    if let Some(delta) = text.as_str().filter(|delta| !delta.is_empty()) {
        progress(LlmStreamEvent::Text(delta.into()));
    }
}

enum Update {
    Metadata,
    Content,
    Complete(String),
}

fn nonempty(value: &Value) -> bool {
    value.as_str().is_some_and(|value| !value.is_empty())
}

fn chat_update(value: &Value, text: &mut String) -> Result<Update, CoreError> {
    let Some(choice) = value["choices"]
        .as_array()
        .and_then(|choices| choices.iter().find(|choice| choice["index"] == 0))
    else {
        return Ok(Update::Metadata);
    };
    let delta = &choice["delta"];
    if nonempty(&delta["refusal"]) {
        return Err(error("REFUSED"));
    }
    if let Some(content) = delta["content"].as_str() {
        if text.len().saturating_add(content.len()) > MAX_RESPONSE_BYTES {
            return Err(error("RESPONSE_TOO_LARGE"));
        }
        text.push_str(content);
    }
    match choice["finish_reason"].as_str() {
        Some("stop") => Ok(Update::Complete(std::mem::take(text))),
        Some("length") => Err(error("OUTPUT_LIMIT")),
        Some(_) => Err(error("INCOMPLETE_RESPONSE")),
        None if nonempty(&delta["content"]) || nonempty(&delta["reasoning_content"]) => {
            Ok(Update::Content)
        }
        None => Ok(Update::Metadata),
    }
}

fn responses_update(value: &Value) -> Result<Update, CoreError> {
    match value["type"].as_str() {
        Some("response.completed" | "response.incomplete") => {
            response_text(LlmProtocol::Responses, &value["response"]).map(Update::Complete)
        }
        Some("response.failed" | "error") => Err(error("GENERATION_FAILED")),
        Some("response.refusal.delta" | "response.refusal.done") => Err(error("REFUSED")),
        Some(
            "response.output_text.delta"
            | "response.reasoning_text.delta"
            | "response.reasoning_summary_text.delta",
        ) if nonempty(&value["delta"]) => Ok(Update::Content),
        _ => Ok(Update::Metadata),
    }
}

#[cfg(test)]
mod tests;
