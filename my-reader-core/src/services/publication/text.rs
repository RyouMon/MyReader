use super::webpub::{Package, XHTML};
use crate::CoreError;
use pulldown_cmark::{html, Event, HeadingLevel, Options, Parser, Tag, TagEnd};
use serde_json::{json, Value};
use std::collections::HashMap;

fn decode(bytes: &[u8]) -> String {
    if let Some((encoding, skip)) = encoding_rs::Encoding::for_bom(bytes) {
        return encoding
            .decode_without_bom_handling(&bytes[skip..])
            .0
            .into_owned();
    }
    if let Ok(s) = std::str::from_utf8(bytes) {
        return s.to_owned();
    }
    let mut detector = chardetng::EncodingDetector::new();
    detector.feed(bytes, true);
    detector.guess(None, true).decode(bytes).0.into_owned()
}

fn escape(text: &str) -> String {
    quick_xml::escape::escape(text).into_owned()
}
fn path(index: usize) -> String {
    format!("chapter-{index:04}.xhtml")
}
struct Chapter {
    title: String,
    body: String,
}

fn text_chapters(text: &str, title: &str) -> Vec<Chapter> {
    let mut result = Vec::new();
    let mut current = Chapter {
        title: title.into(),
        body: String::new(),
    };
    for line in text.lines().map(str::trim).filter(|l| !l.is_empty()) {
        let heading = line.chars().count() < 96
            && ((line.starts_with('第') && line.contains(['章', '回', '节', '卷']))
                || line.to_ascii_lowercase().starts_with("chapter "));
        if !current.body.is_empty() && (heading || current.body.len() >= 48 * 1024) {
            result.push(current);
            current = Chapter {
                title: format!("{title} {}", result.len() + 1),
                body: String::new(),
            };
        }
        let tag = if heading { "h1" } else { "p" };
        if heading {
            current.title = line.into();
        }
        current
            .body
            .push_str(&format!("<{tag}>{}</{tag}>\n", escape(line)));
    }
    if !current.body.is_empty() {
        result.push(current);
    }
    result
}

fn slug(text: &str) -> String {
    text.to_lowercase()
        .split_whitespace()
        .map(|w| {
            w.chars()
                .filter(|c| c.is_alphanumeric() || *c == '-' || *c == '_')
                .collect::<String>()
        })
        .collect::<Vec<_>>()
        .join("-")
}

fn markdown_chapters(text: &str, title: &str) -> Vec<Chapter> {
    let events: Vec<_> = Parser::new_ext(
        text,
        Options::ENABLE_TABLES | Options::ENABLE_STRIKETHROUGH | Options::ENABLE_HEADING_ATTRIBUTES,
    )
    .collect();
    let mut headings = HashMap::new();
    let mut locations = HashMap::new();
    let mut sections = vec![(0, title.to_owned())];
    let mut depth = 0;
    for (index, event) in events.iter().enumerate() {
        if let Event::Start(Tag::Heading { level, id, .. }) = event {
            let label: String = events[index + 1..]
                .iter()
                .take_while(|e| !matches!(e, Event::End(TagEnd::Heading(_))))
                .filter_map(|e| match e {
                    Event::Text(t) | Event::Code(t) => Some(t.as_ref()),
                    _ => None,
                })
                .collect();
            if depth == 0 && matches!(level, HeadingLevel::H1 | HeadingLevel::H2) {
                if index == 0 {
                    sections[0].1 = label.clone();
                } else {
                    sections.push((index, label.clone()));
                }
            }
            let base = id
                .as_ref()
                .map(|v| v.to_string())
                .unwrap_or_else(|| slug(&label));
            let mut anchor = base.clone();
            for n in 1.. {
                if !locations.contains_key(&anchor) {
                    break;
                }
                anchor = format!("{base}-{n}");
            }
            locations.insert(anchor.clone(), path(sections.len() - 1));
            headings.insert(index, anchor);
        }
        match event {
            Event::Start(_) => depth += 1,
            Event::End(_) => depth -= 1,
            _ => {}
        }
    }
    sections
        .iter()
        .enumerate()
        .map(|(i, (start, label))| {
            let end = sections.get(i + 1).map_or(events.len(), |s| s.0);
            let mut body = String::new();
            html::push_html(
                &mut body,
                events[*start..end].iter().cloned().enumerate().map(
                    |(offset, event)| match event {
                        Event::Html(raw) | Event::InlineHtml(raw) => Event::Text(raw),
                        Event::Start(Tag::Heading { level, .. }) => Event::Start(Tag::Heading {
                            level,
                            id: headings.get(&(start + offset)).cloned().map(Into::into),
                            classes: vec![],
                            attrs: vec![],
                        }),
                        Event::Start(Tag::Link {
                            link_type,
                            dest_url,
                            title,
                            id,
                        }) => {
                            let target = dest_url
                                .strip_prefix('#')
                                .and_then(|a| locations.get(a).map(|p| format!("{p}#{a}")))
                                .unwrap_or_default();
                            Event::Start(Tag::Link {
                                link_type,
                                dest_url: target.into(),
                                title,
                                id,
                            })
                        }
                        Event::Start(Tag::Image { .. }) => Event::Text("".into()),
                        Event::End(TagEnd::Image) => Event::Text("".into()),
                        other => other,
                    },
                ),
            );
            Chapter {
                title: label.clone(),
                body,
            }
        })
        .collect()
}

pub(super) fn write(
    package: Package,
    bytes: &[u8],
    markdown: bool,
    title: &str,
) -> Result<(), CoreError> {
    let text = decode(bytes);
    let text = text.trim_start_matches('\u{feff}').replace(
        |c: char| {
            c < ' ' && !matches!(c, '\r' | '\n' | '\t') || matches!(c, '\u{fffe}' | '\u{ffff}')
        },
        "",
    );
    if text.trim().is_empty() {
        return Err(super::invalid("EMPTY_BOOK"));
    }
    let chapters = if markdown {
        markdown_chapters(&text, title)
    } else {
        text_chapters(&text, title)
    };
    let mut package = package;
    let mut links: Vec<Value> = Vec::new();
    for (i, c) in chapters.iter().enumerate() {
        let href = path(i);
        let content = format!(
            r#"<html xmlns="http://www.w3.org/1999/xhtml"><head><title>{}</title></head><body>{}</body></html>"#,
            escape(&c.title),
            c.body
        );
        package.add(&href, content.as_bytes())?;
        links.push(json!({"href":href,"type":XHTML,"title":c.title}));
    }
    package.finish(json!({"metadata":{"title":title},"readingOrder":links,"toc":links}))
}
