use std::time::Duration;

use reqwest::{Client, RequestBuilder, Response};
use serde_json::{json, Value};

use crate::{
    models::{LlmMessage, LlmProtocol, LlmProviderProfile},
    CoreError,
};

const MAX_RESPONSE_BYTES: usize = 2 * 1024 * 1024;

pub(crate) fn client() -> Result<Client, CoreError> {
    super::http::client_builder()
        .timeout(Duration::from_secs(30))
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|_| error("CLIENT"))
}

fn authorize(request: RequestBuilder, credential: Option<&str>) -> RequestBuilder {
    match credential.filter(|value| !value.trim().is_empty()) {
        Some(credential) => request.bearer_auth(credential),
        None => request,
    }
}

pub(crate) async fn complete(
    profile: &LlmProviderProfile,
    credential: Option<&str>,
    messages: &[LlmMessage],
    schema: Value,
) -> Result<Value, CoreError> {
    complete_with_output_limit(profile, credential, messages, schema, 4096).await
}

pub(crate) async fn complete_with_output_limit(
    profile: &LlmProviderProfile,
    credential: Option<&str>,
    messages: &[LlmMessage],
    schema: Value,
    output_tokens: u32,
) -> Result<Value, CoreError> {
    let format = json!({"name":"myreader_result", "strict":true, "schema":schema});
    let output_tokens = output_tokens.min(profile.max_output_tokens.unwrap_or(u32::MAX));
    let (suffix, mut body) = match profile.protocol {
        LlmProtocol::ChatCompletions => (
            "chat/completions",
            json!({
                "model":profile.model, "messages":messages, "stream":false,
                "max_completion_tokens":output_tokens, "response_format":{"type":"json_schema", "json_schema":format}
            }),
        ),
        LlmProtocol::Responses => (
            "responses",
            json!({
                "model":profile.model, "input":messages, "store":false, "stream":false,
                "max_output_tokens":output_tokens, "text":{"format":{
                    "type":"json_schema", "name":"myreader_result", "strict":true, "schema":format["schema"]
                }}
            }),
        ),
    };
    let client = client()?;
    let url = endpoint(profile, suffix);
    let response = authorize(client.post(&url), credential)
        .json(&body)
        .send()
        .await
        .map_err(map_network_error)?;
    let response = if profile.protocol == LlmProtocol::ChatCompletions
        && response.status() == reqwest::StatusCode::BAD_REQUEST
    {
        let bytes = read_bytes(response).await?;
        let failure: Value = serde_json::from_slice(&bytes).unwrap_or(Value::Null);
        if !unsupported_schema(&failure) {
            return Err(error("HTTP_400"));
        }
        body["response_format"] = json!({"type":"json_object"});
        let mut json_messages = vec![json!({
            "role":"system",
            "content":format!("Return only a JSON object matching this JSON schema: {}", format["schema"])
        })];
        json_messages.extend(messages.iter().map(|message| json!(message)));
        body["messages"] = json!(json_messages);
        let response = authorize(client.post(&url), credential)
            .json(&body)
            .send()
            .await
            .map_err(map_network_error)?;
        read_json(response).await?
    } else {
        read_json(response).await?
    };
    let text = response_text(profile.protocol, &response)?;
    serde_json::from_str(&text).map_err(|_| error("INVALID_RESPONSE"))
}

fn unsupported_schema(response: &Value) -> bool {
    let message = response["error"]["message"]
        .as_str()
        .unwrap_or_default()
        .to_ascii_lowercase();
    (message.contains("response_format") || message.contains("json_schema"))
        && [
            "unsupported",
            "not supported",
            "unavailable",
            "not available",
        ]
        .iter()
        .any(|reason| message.contains(reason))
}

fn response_text(protocol: LlmProtocol, response: &Value) -> Result<String, CoreError> {
    match protocol {
        LlmProtocol::ChatCompletions => {
            let choice = &response["choices"][0];
            if choice["finish_reason"] == "length" {
                return Err(error("OUTPUT_LIMIT"));
            }
            if choice["finish_reason"] != "stop" {
                return Err(error("INCOMPLETE_RESPONSE"));
            }
            choice["message"]["content"]
                .as_str()
                .map(str::to_owned)
                .ok_or_else(|| error("INVALID_RESPONSE"))
        }
        LlmProtocol::Responses => {
            if response["incomplete_details"]["reason"] == "max_output_tokens" {
                return Err(error("OUTPUT_LIMIT"));
            }
            if response["status"] != "completed" {
                return Err(error("INCOMPLETE_RESPONSE"));
            }
            let mut result = String::new();
            for item in response["output"]
                .as_array()
                .ok_or_else(|| error("INVALID_RESPONSE"))?
            {
                if item["type"] != "message" {
                    continue;
                }
                for part in item["content"]
                    .as_array()
                    .ok_or_else(|| error("INVALID_RESPONSE"))?
                {
                    if part["type"] == "refusal" {
                        return Err(error("REFUSED"));
                    }
                    if part["type"] == "output_text" {
                        result.push_str(
                            part["text"]
                                .as_str()
                                .ok_or_else(|| error("INVALID_RESPONSE"))?,
                        );
                    }
                }
            }
            if result.is_empty() {
                return Err(error("INVALID_RESPONSE"));
            }
            Ok(result)
        }
    }
}

pub(crate) async fn list_models(
    profile: &LlmProviderProfile,
    credential: Option<&str>,
) -> Result<Vec<String>, CoreError> {
    let response = authorize(client()?.get(endpoint(profile, "models")), credential)
        .send()
        .await
        .map_err(map_network_error)?;
    let response = read_json(response).await?;
    let mut models: Vec<_> = response["data"]
        .as_array()
        .ok_or_else(|| error("INVALID_RESPONSE"))?
        .iter()
        .filter_map(|model| model["id"].as_str().map(str::to_owned))
        .collect();
    models.sort();
    models.dedup();
    Ok(models)
}

pub(crate) async fn probe(
    profile: &LlmProviderProfile,
    credential: Option<&str>,
) -> Result<(), CoreError> {
    let result = complete(profile, credential, &[LlmMessage {role:"user".into(), content:"Return ok=true.".into()}],
        json!({"type":"object","properties":{"ok":{"type":"boolean"}},"required":["ok"],"additionalProperties":false})).await?;
    if result["ok"] != true {
        return Err(error("INVALID_RESPONSE"));
    }
    Ok(())
}

fn endpoint(profile: &LlmProviderProfile, suffix: &str) -> String {
    let base = profile.endpoint.trim_end_matches('/');
    let base = base
        .strip_suffix("/chat/completions")
        .or_else(|| base.strip_suffix("/responses"))
        .unwrap_or(base);
    format!("{base}/{suffix}")
}

pub(crate) async fn read_json(response: Response) -> Result<Value, CoreError> {
    if !response.status().is_success() {
        return Err(error(&format!("HTTP_{}", response.status().as_u16())));
    }
    let bytes = read_bytes(response).await?;
    serde_json::from_slice(&bytes).map_err(|_| error("INVALID_RESPONSE"))
}

async fn read_bytes(mut response: Response) -> Result<Vec<u8>, CoreError> {
    if response
        .content_length()
        .is_some_and(|length| length > MAX_RESPONSE_BYTES as u64)
    {
        return Err(error("RESPONSE_TOO_LARGE"));
    }
    let mut bytes = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(map_network_error)? {
        if bytes.len().saturating_add(chunk.len()) > MAX_RESPONSE_BYTES {
            return Err(error("RESPONSE_TOO_LARGE"));
        }
        bytes.extend_from_slice(&chunk);
    }
    Ok(bytes)
}

fn map_network_error(error_value: reqwest::Error) -> CoreError {
    error(if error_value.is_timeout() {
        "TIMEOUT"
    } else {
        "NETWORK"
    })
}

fn error(code: &str) -> CoreError {
    CoreError::Config(format!("LLM_{code}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_only_complete_text_responses() {
        assert_eq!(
            response_text(
                LlmProtocol::ChatCompletions,
                &json!({"choices":[{"finish_reason":"stop","message":{"content":"{\"ok\":true}"}}]})
            )
            .unwrap(),
            "{\"ok\":true}"
        );
        assert!(response_text(
            LlmProtocol::ChatCompletions,
            &json!({"choices":[{"finish_reason":"length","message":{"content":"{}"}}]})
        )
        .unwrap_err()
        .to_string()
        .contains("LLM_OUTPUT_LIMIT"));
        assert_eq!(response_text(LlmProtocol::Responses, &json!({"status":"completed","output":[{"type":"message","content":[{"type":"output_text","text":"{}"}]}]})).unwrap(), "{}");
        assert!(response_text(LlmProtocol::Responses, &json!({"status":"completed","output":[{"type":"message","content":[{"type":"refusal","refusal":"no"}]}]})).is_err());
        assert!(response_text(
            LlmProtocol::Responses,
            &json!({"status":"incomplete","output":[]})
        )
        .unwrap_err()
        .to_string()
        .contains("LLM_INCOMPLETE_RESPONSE"));
        assert!(response_text(
            LlmProtocol::Responses,
            &json!({"status":"incomplete","incomplete_details":{"reason":"max_output_tokens"},"output":[]})
        )
        .unwrap_err().to_string().contains("LLM_OUTPUT_LIMIT"));
    }
}
