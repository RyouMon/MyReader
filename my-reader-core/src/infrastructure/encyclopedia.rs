use super::llm;
use crate::{models::CharacterImportRequest, CoreError};
use serde_json::{json, Value};

fn error(code: &str) -> CoreError {
    CoreError::Config(format!("NARRATION_{code}"))
}

pub async fn search_cast(
    origin: &str,
    request: &CharacterImportRequest,
) -> Result<Vec<Value>, CoreError> {
    let client = llm::client()?;
    let api = format!("{origin}/w/api.php");
    let suffix = if request.language.starts_with("zh") {
        "人物"
    } else if request.language.starts_with("ja") {
        "登場人物"
    } else {
        "characters"
    };
    let mut pages = Vec::new();
    for query in [
        format!("{} {}", request.title, suffix),
        request.title.clone(),
    ] {
        let mut url = url::Url::parse(&api).map_err(|_| error("SOURCE_INVALID"))?;
        url.query_pairs_mut().extend_pairs([
            ("action", "query"),
            ("format", "json"),
            ("formatversion", "2"),
            ("list", "search"),
            ("srsearch", query.as_str()),
            ("srlimit", "3"),
        ]);
        let response = client
            .get(url)
            .header(
                "User-Agent",
                "MyReader/0.19 (https://github.com/RyouMon/MyReader)",
            )
            .send()
            .await
            .map_err(|_| error("SEARCH_FAILED"))?;
        let result = llm::read_json(response).await?;
        for page in result["query"]["search"]
            .as_array()
            .ok_or_else(|| error("SEARCH_FAILED"))?
        {
            if let (Some(id), Some(title)) = (page["pageid"].as_i64(), page["title"].as_str()) {
                if !pages.iter().any(|(existing, _)| *existing == id) {
                    pages.push((id, title.to_owned()));
                }
            }
        }
        if pages.len() >= 3 {
            break;
        }
    }
    let mut sources = Vec::new();
    for (id, title) in pages.into_iter().take(3) {
        let mut url = url::Url::parse(&api).map_err(|_| error("SOURCE_INVALID"))?;
        url.query_pairs_mut().extend_pairs([
            ("action", "query"),
            ("format", "json"),
            ("formatversion", "2"),
            ("prop", "revisions"),
            ("rvprop", "content"),
            ("rvslots", "main"),
            ("pageids", &id.to_string()),
        ]);
        let response = client
            .get(url)
            .header(
                "User-Agent",
                "MyReader/0.19 (https://github.com/RyouMon/MyReader)",
            )
            .send()
            .await
            .map_err(|_| error("SEARCH_FAILED"))?;
        let result = llm::read_json(response).await?;
        if let Some(content) =
            result["query"]["pages"][0]["revisions"][0]["slots"]["main"]["content"].as_str()
        {
            let mut url = url::Url::parse(origin).map_err(|_| error("SOURCE_INVALID"))?;
            url.set_path("/w/index.php");
            url.query_pairs_mut().append_pair("curid", &id.to_string());
            sources.push(json!({"title":title,"url":url.as_str(),"content":cast_excerpt(content)}));
        }
    }
    if sources.is_empty() {
        return Err(error("CHARACTERS_NOT_FOUND"));
    }
    Ok(sources)
}

fn cast_excerpt(content: &str) -> String {
    let lines: Vec<_> = content.lines().collect();
    let start = lines
        .iter()
        .position(|line| {
            line.starts_with('=')
                && ["人物", "角色", "登場", "character", "cast"]
                    .iter()
                    .any(|needle| line.to_lowercase().contains(needle))
        })
        .unwrap_or(0);
    // Include the lead for work/author disambiguation, then favor the cast section.
    format!(
        "{}\n{}",
        content.chars().take(600).collect::<String>(),
        lines[start..]
            .join("\n")
            .chars()
            .take(1800)
            .collect::<String>()
    )
}
