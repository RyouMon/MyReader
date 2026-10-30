use super::*;
use serde_json::json;
use std::time::Duration;

fn event(value: Value) -> Vec<u8> {
    format!("data: {value}\n\n").into_bytes()
}

fn delta(protocol: LlmProtocol, text: &str) -> Vec<u8> {
    event(match protocol {
        LlmProtocol::ChatCompletions => {
            json!({"choices":[{"index":0,"delta":{"content":text},"finish_reason":null}]})
        }
        LlmProtocol::Responses => json!({"type":"response.output_text.delta","delta":text}),
    })
}

fn complete(protocol: LlmProtocol, text: &str) -> Vec<u8> {
    event(match protocol {
        LlmProtocol::ChatCompletions => {
            json!({"choices":[{"index":0,"delta":{},"finish_reason":"stop"}]})
        }
        LlmProtocol::Responses => {
            json!({"type":"response.completed","response":{"status":"completed","output":[{"type":"message","content":[{"type":"output_text","text":text}]}]}})
        }
    })
}

async fn read_chunks(
    protocol: LlmProtocol,
    chunks: Vec<(u64, Vec<u8>)>,
) -> Result<String, CoreError> {
    let bytes = stream::iter(chunks).then(|(delay, chunk)| async move {
        tokio::time::sleep(Duration::from_secs(delay)).await;
        Ok::<_, CoreError>(chunk)
    });
    read_events(
        bytes.eventsource(),
        protocol,
        Instant::now() + IDLE_TIMEOUT,
        None,
    )
    .await
}

#[tokio::test(start_paused = true)]
async fn effective_content_keeps_both_protocols_alive_beyond_thirty_seconds() {
    for protocol in [LlmProtocol::ChatCompletions, LlmProtocol::Responses] {
        let start = Instant::now();
        let result = read_chunks(
            protocol,
            vec![
                (20, delta(protocol, "{\"name\":")),
                (20, delta(protocol, "\"椎名真昼\"")),
                (20, delta(protocol, "}")),
                (20, complete(protocol, "{\"name\":\"椎名真昼\"}")),
            ],
        )
        .await
        .unwrap();
        assert_eq!(
            serde_json::from_str::<Value>(&result).unwrap()["name"],
            "椎名真昼"
        );
        assert!(start.elapsed() > Duration::from_secs(60));
    }
}

#[tokio::test(start_paused = true)]
async fn reasoning_deltas_count_as_progress_but_never_enter_the_result() {
    let cases = [
        (
            LlmProtocol::ChatCompletions,
            json!({"choices":[{"index":0,"delta":{"reasoning_content":"Analyzing characters"}}]}),
        ),
        (
            LlmProtocol::Responses,
            json!({"type":"response.reasoning_text.delta","delta":"Analyzing characters"}),
        ),
        (
            LlmProtocol::Responses,
            json!({"type":"response.reasoning_summary_text.delta","delta":"Analyzing characters"}),
        ),
    ];
    for (protocol, reasoning) in cases {
        let result = read_chunks(
            protocol,
            vec![
                (20, event(reasoning)),
                (20, delta(protocol, "{}")),
                (20, complete(protocol, "{}")),
            ],
        )
        .await
        .unwrap();
        assert_eq!(result, "{}");
    }
}

#[tokio::test]
async fn progress_arrives_in_order_before_completion_without_metadata_or_empty_deltas() {
    use std::sync::Mutex;
    for protocol in [LlmProtocol::ChatCompletions, LlmProtocol::Responses] {
        let events = Mutex::new(Vec::new());
        let reasoning = match protocol {
            LlmProtocol::ChatCompletions => {
                json!({"choices":[{"index":0,"delta":{"reasoning_content":"核对人物"}}]})
            }
            LlmProtocol::Responses => {
                json!({"type":"response.reasoning_text.delta","delta":"核对人物"})
            }
        };
        let chunks = vec![
            b": heartbeat\n\n".to_vec(),
            delta(protocol, ""),
            event(reasoning),
            delta(protocol, "{\"name\":\"真昼\"}"),
            complete(protocol, "{\"name\":\"真昼\"}"),
        ];
        let bytes = stream::iter(chunks).enumerate().map(|(index, chunk)| {
            if index == 4 {
                assert_eq!(
                    *events.lock().unwrap(),
                    vec![
                        LlmStreamEvent::Reasoning("核对人物".into()),
                        LlmStreamEvent::Text("{\"name\":\"真昼\"}".into()),
                    ]
                );
            }
            Ok::<_, CoreError>(chunk)
        });
        let progress = |event| events.lock().unwrap().push(event);
        let result = read_events(
            bytes.eventsource(),
            protocol,
            Instant::now() + IDLE_TIMEOUT,
            Some(&progress),
        )
        .await
        .unwrap();
        assert_eq!(result, "{\"name\":\"真昼\"}");
        assert_eq!(events.lock().unwrap().len(), 2);
    }
}

#[tokio::test(start_paused = true)]
async fn heartbeats_metadata_empty_deltas_and_partial_events_do_not_reset_the_deadline() {
    for protocol in [LlmProtocol::ChatCompletions, LlmProtocol::Responses] {
        let messages = [
            b": keep-alive\n\n".to_vec(),
            event(
                json!({"type":"response.in_progress","choices":[{"index":0,"delta":{"role":"assistant"}}]}),
            ),
            delta(protocol, ""),
            b"data: {\"incomplete".to_vec(),
        ];
        for message in messages {
            for started in [false, true] {
                let start = Instant::now();
                let mut chunks = Vec::new();
                if started {
                    chunks.push((20, delta(protocol, "{")));
                }
                chunks.extend([(20, message.clone()), (20, message.clone())]);
                let result = read_chunks(protocol, chunks).await.unwrap_err();
                assert!(result.to_string().contains("LLM_TIMEOUT"), "{result}");
                assert_eq!(start.elapsed().as_secs(), if started { 50 } else { 30 });
            }
        }
    }
}

#[tokio::test]
async fn decodes_split_utf8_crlf_and_multiple_data_lines() {
    let value = json!({"choices":[{"index":0,"delta":{"content":"{\"name\":\"真昼\"}"},"finish_reason":null}]});
    let payload = value.to_string().replacen('[', "\r\ndata: [", 1);
    let mut data = format!(": comment\r\nevent: message\r\ndata: {payload}\r\n\r\n").into_bytes();
    data.extend(complete(LlmProtocol::ChatCompletions, ""));
    let chunks = data.into_iter().map(|byte| (0, vec![byte])).collect();
    let result = read_chunks(LlmProtocol::ChatCompletions, chunks)
        .await
        .unwrap();
    assert_eq!(result, "{\"name\":\"真昼\"}");
}

#[tokio::test]
async fn truncated_or_failed_streams_never_return_partial_character_data() {
    for protocol in [LlmProtocol::ChatCompletions, LlmProtocol::Responses] {
        for suffix in [Vec::new(), b"data: [DONE]\n\n".to_vec()] {
            let result = read_chunks(protocol, vec![(0, delta(protocol, "{}")), (0, suffix)])
                .await
                .unwrap_err();
            assert!(result.to_string().contains("LLM_INCOMPLETE_RESPONSE"));
        }
    }
    let cases = [
        (
            LlmProtocol::ChatCompletions,
            json!({"choices":[{"index":0,"finish_reason":"length"}]}),
            "OUTPUT_LIMIT",
        ),
        (
            LlmProtocol::ChatCompletions,
            json!({"choices":[{"index":0,"delta":{"refusal":"No"}}]}),
            "REFUSED",
        ),
        (
            LlmProtocol::ChatCompletions,
            json!({"choices":[{"index":0,"finish_reason":"content_filter"}]}),
            "INCOMPLETE_RESPONSE",
        ),
        (
            LlmProtocol::Responses,
            json!({"type":"response.incomplete","response":{"status":"incomplete","incomplete_details":{"reason":"max_output_tokens"}}}),
            "OUTPUT_LIMIT",
        ),
        (
            LlmProtocol::Responses,
            json!({"type":"response.refusal.delta","delta":"No"}),
            "REFUSED",
        ),
        (
            LlmProtocol::Responses,
            json!({"type":"response.failed"}),
            "GENERATION_FAILED",
        ),
        (
            LlmProtocol::Responses,
            json!({"type":"error"}),
            "GENERATION_FAILED",
        ),
        (
            LlmProtocol::ChatCompletions,
            json!({"error":{"message":"Failed"}}),
            "GENERATION_FAILED",
        ),
    ];
    for (protocol, value, expected) in cases {
        let result = read_chunks(protocol, vec![(0, event(value))])
            .await
            .unwrap_err();
        assert!(result.to_string().contains(expected), "{result}");
    }
}

#[tokio::test]
async fn rejects_malformed_events_and_oversized_content() {
    for bytes in [b"data: not json\n\n".to_vec(), b"data: \xff\n\n".to_vec()] {
        let result = read_chunks(LlmProtocol::ChatCompletions, vec![(0, bytes)])
            .await
            .unwrap_err();
        assert!(result.to_string().contains("LLM_INVALID_RESPONSE"));
    }
    let result = read_chunks(
        LlmProtocol::ChatCompletions,
        vec![(
            0,
            delta(
                LlmProtocol::ChatCompletions,
                &"x".repeat(MAX_RESPONSE_BYTES + 1),
            ),
        )],
    )
    .await
    .unwrap_err();
    assert!(result.to_string().contains("LLM_RESPONSE_TOO_LARGE"));
}
