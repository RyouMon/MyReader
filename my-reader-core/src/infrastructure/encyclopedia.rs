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
            for excerpt in cast_excerpts(content) {
                sources.push(json!({"title":title,"url":url.as_str(),"content":excerpt}));
            }
        }
    }
    if sources.is_empty() {
        return Err(error("CHARACTERS_NOT_FOUND"));
    }
    Ok(sources)
}

fn cast_sections(content: &str) -> String {
    let mut level = None;
    let mut lines = Vec::new();
    for line in content.lines() {
        let heading = line
            .chars()
            .take_while(|character| *character == '=')
            .count();
        if heading > 0 {
            if level.is_some_and(|current| heading <= current) {
                level = None;
            }
            if level.is_none()
                && ["人物", "角色", "登場", "character", "cast"]
                    .iter()
                    .any(|needle| line.to_lowercase().contains(needle))
            {
                level = Some(heading);
            }
        }
        if level.is_some() {
            lines.push(line);
        }
    }
    if lines.is_empty() {
        content.to_owned()
    } else {
        lines.join("\n")
    }
}

fn cast_excerpts(content: &str) -> Vec<String> {
    let section = cast_sections(content);
    let definitions = section.lines().any(|line| line.starts_with(';'));
    let lead: String = content.chars().take(600).collect();
    let mut entries = Vec::new();
    let mut entry = String::new();
    for line in section.lines() {
        let boundary = if definitions {
            line.starts_with(';')
        } else {
            line.starts_with('=') || line.starts_with("* ")
        };
        if boundary && !entry.is_empty() {
            entries.push(std::mem::take(&mut entry));
        }
        entry.push_str(line);
        entry.push('\n');
    }
    if !entry.is_empty() {
        entries.push(entry);
    }
    // Bound descriptions per entry, never the beginning of the entire cast list.
    // Definition lists and headings keep a long protagonist biography from hiding others.
    let mut batches = Vec::new();
    let mut batch = String::new();
    let mut count = 0;
    for entry in entries {
        let excerpt: String = entry.chars().take(1800).collect();
        if !batch.is_empty()
            && (batch.chars().count() + excerpt.chars().count() > 4000 || count == 12)
        {
            batches.push(format!("{lead}\n{batch}"));
            batch.clear();
            count = 0;
        }
        batch.push_str(&excerpt);
        batch.push('\n');
        count += 1;
    }
    if !batch.is_empty() {
        batches.push(format!("{lead}\n{batch}"));
    }
    batches
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn long_first_biography_does_not_hide_the_remaining_cast() {
        let mut page = format!(
            "A novel by Writer\n== 角色列表 ==\n=== 主角 ===\n; 主角\n{}\n",
            "很长的经历".repeat(1000)
        );
        for index in 1..=30 {
            page.push_str(&format!("; 人物{index}\n人物{index}的身份。\n"));
        }
        page.push_str("== 出版资料 ==\n不属于人物列表");
        let batches = cast_excerpts(&page);
        assert!(batches.len() >= 2);
        let combined = batches.join("\n");
        for index in 1..=30 {
            assert!(combined.contains(&format!("; 人物{index}\n")));
        }
        assert!(!combined.contains("不属于人物列表"));
        assert!(batches.iter().all(|batch| batch.chars().count() <= 4602));
    }

    #[test]
    fn collects_cast_subsections_and_separate_character_sections() {
        let page = "A novel\n== Main characters ==\n=== Alice ===\nThe lead.\n=== Bob ===\nA friend.\n== Publication ==\nIgnore me.\n== Other characters ==\n* Carol: A teacher.\n== Notes ==\nIgnore me too.";
        let content = cast_excerpts(page).join("\n");
        assert!(content.contains("Alice"));
        assert!(content.contains("Bob"));
        assert!(content.contains("Carol"));
        let sections = cast_sections(page);
        assert!(!sections.contains("Ignore me"));
    }
}
