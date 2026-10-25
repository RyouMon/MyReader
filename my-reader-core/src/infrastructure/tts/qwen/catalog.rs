use super::*;

// DashScope's model catalog and Token Plan's OpenAI-compatible catalog are
// separate gateways. Never fall back to another billing endpoint.
pub(crate) async fn discover_models(
    base: &str,
    credential: Option<&str>,
) -> Result<Vec<QwenTtsModel>, CoreError> {
    let credential = credential
        .filter(|key| !key.trim().is_empty())
        .ok_or_else(|| tts_error(TtsErrorKind::Unauthorized, "TTS_CREDENTIAL_REQUIRED"))?;
    if credential.starts_with("sk-sp-") && !uses_websocket(base) {
        return Err(tts_error(
            TtsErrorKind::Configuration,
            "QWEN_TOKEN_PLAN_WEBSOCKET_REQUIRED",
        ));
    }
    let url = models_endpoint(base)?;
    let http = client()?;
    let mut models: Vec<QwenTtsModel> = Vec::new();
    let mut seen = std::collections::HashSet::new();
    let mut page = 1;
    loop {
        let mut page_url = url.clone();
        page_url
            .query_pairs_mut()
            .append_pair("page_no", &page.to_string())
            .append_pair("page_size", "100");
        let response = http
            .get(page_url)
            .bearer_auth(credential)
            .send()
            .await
            .map_err(map_reqwest_error)?;
        let body = json_response(response, credential, "model catalog").await?;
        let (entries, total) = catalog_page(&body)?;
        let previous = seen.len();
        for entry in entries {
            let id = entry["model"]
                .as_str()
                .or_else(|| entry["id"].as_str())
                .filter(|id| !id.trim().is_empty())
                .ok_or_else(invalid_catalog)?;
            if !seen.insert(id.to_owned()) {
                continue;
            }
            // Only list models supported by an implemented wire protocol. This
            // accepts new versions without maintaining a list of model IDs.
            if let Ok(mut selected) = model(id, base) {
                if let Some(name) = entry["name"]
                    .as_str()
                    .filter(|name| !name.trim().is_empty())
                {
                    selected.name = name.to_owned();
                }
                models.push(selected);
            }
        }
        if body["data"].is_array() || total.is_some_and(|total| seen.len() >= total) {
            break;
        }
        if entries.is_empty() || seen.len() == previous {
            return Err(invalid_catalog());
        }
        if total.is_none() && entries.len() < 100 {
            break;
        }
        page += 1;
    }
    models.sort_by(|a, b| a.id.cmp(&b.id));
    Ok(models)
}

fn catalog_page(body: &Value) -> Result<(&Vec<Value>, Option<usize>), CoreError> {
    let entries = body
        .pointer("/output/models")
        .or_else(|| body.get("data"))
        .and_then(Value::as_array)
        .ok_or_else(invalid_catalog)?;
    let total = body
        .pointer("/output/total")
        .and_then(Value::as_u64)
        .map(|n| n as usize);
    Ok((entries, total))
}

fn invalid_catalog() -> CoreError {
    tts_error(TtsErrorKind::InvalidResponse, "TTS_INVALID_MODEL_LIST")
}

fn models_endpoint(base: &str) -> Result<Url, CoreError> {
    if !uses_websocket(base) {
        return api_endpoint(base, "/models");
    }
    let mut url = Url::parse(base)
        .map_err(|_| tts_error(TtsErrorKind::Configuration, "INVALID_TTS_ENDPOINT"))?;
    let scheme = if url.scheme() == "ws" {
        "http"
    } else {
        "https"
    };
    url.set_scheme(scheme)
        .map_err(|_| tts_error(TtsErrorKind::Configuration, "INVALID_TTS_ENDPOINT"))?;
    url.set_path("/compatible-mode/v1");
    api_endpoint(url.as_str(), "/models")
}
