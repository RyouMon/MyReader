use super::{invalid, webpub::LIMIT};
use crate::CoreError;
use axum::body::Bytes;
use serde_json::{json, Value};
use std::{
    collections::BTreeMap,
    io::{Cursor, Read},
};
use zip::ZipArchive;

pub(super) struct Input {
    pub kind: &'static str,
    pub entry: String,
    pub files: BTreeMap<String, Bytes>,
}
impl Input {
    pub fn description(&self) -> Value {
        json!({"kind":self.kind,"entry":self.entry,"files":self.files.keys().collect::<Vec<_>>()})
    }
    pub fn open(format: &str, bytes: Vec<u8>) -> Result<Self, CoreError> {
        let kind = match format {
            "TXT" | "TXTZ" => "text",
            "MD" | "MARKDOWN" => "markdown",
            "FB2" | "FBZ" | "FB2.ZIP" => "fb2",
            "AZW" | "MOBI" | "AZW3" | "KF8" | "PRC" => {
                check_kindle(&bytes)?;
                "mobi"
            }
            "HTMLZ" | "XHTML" | "HTML" | "HTM" => "html",
            _ => return Err(invalid("UNSUPPORTED_FORMAT")),
        };
        if matches!(format, "TXTZ" | "HTMLZ" | "FB2.ZIP" | "FBZ") {
            return archive(bytes, kind);
        }
        Ok(Self {
            kind,
            entry: "book".into(),
            files: BTreeMap::from([("book".into(), bytes.into())]),
        })
    }
}
fn archive(bytes: Vec<u8>, kind: &'static str) -> Result<Input, CoreError> {
    let mut zip = ZipArchive::new(Cursor::new(bytes)).map_err(|e| invalid(e.to_string()))?;
    if zip.len() > 4096 {
        return Err(invalid("ARCHIVE_TOO_LARGE"));
    }
    let mut files = BTreeMap::new();
    let mut remaining = LIMIT;
    for i in 0..zip.len() {
        let entry = zip.by_index(i).map_err(|e| invalid(e.to_string()))?;
        if entry.is_dir() {
            continue;
        }
        if entry.enclosed_name().is_none() || entry.is_symlink() || entry.encrypted() {
            return Err(invalid("INVALID_ARCHIVE_ENTRY"));
        }
        let name = entry
            .name()
            .map_err(|e| invalid(e.to_string()))?
            .into_owned();
        if name.contains(['\\', '?', '#', ':', '%'])
            || name.split('/').any(|p| matches!(p, "" | "." | ".."))
        {
            return Err(invalid("INVALID_ARCHIVE_ENTRY"));
        }
        if entry.size() > remaining as u64 {
            return Err(invalid("ARCHIVE_TOO_LARGE"));
        }
        let mut content = Vec::new();
        entry.take(remaining as u64 + 1).read_to_end(&mut content)?;
        remaining = remaining
            .checked_sub(content.len())
            .ok_or_else(|| invalid("ARCHIVE_TOO_LARGE"))?;
        if files.insert(name, Bytes::from(content)).is_some() {
            return Err(invalid("DUPLICATE_ARCHIVE_ENTRY"));
        }
    }
    let extensions: &[&str] = match kind {
        "fb2" => &["fb2"],
        "text" => &["txt"],
        _ => &["html", "htm", "xhtml"],
    };
    let entry = files
        .keys()
        .filter(|s| {
            s.rsplit_once('.')
                .is_some_and(|(_, ext)| extensions.contains(&ext.to_ascii_lowercase().as_str()))
        })
        .min_by_key(|s| {
            (
                !s.eq_ignore_ascii_case("index.html"),
                s.matches('/').count(),
                *s,
            )
        })
        .cloned()
        .ok_or_else(|| invalid("MISSING_ARCHIVE_ENTRY"))?;
    Ok(Input { kind, entry, files })
}

fn check_kindle(data: &[u8]) -> Result<(), CoreError> {
    let field = |offset: usize| {
        data.get(offset..offset + 4)
            .and_then(|s| s.try_into().ok())
            .map(u32::from_be_bytes)
    };
    if data.get(60..68) != Some(b"BOOKMOBI") {
        return Err(invalid("UNSUPPORTED_KINDLE_CONTENT"));
    }
    let count = data
        .get(76..78)
        .and_then(|s| s.try_into().ok())
        .map(u16::from_be_bytes)
        .unwrap_or(0) as usize;
    if count < 2 || 78 + count * 8 > data.len() {
        return Err(invalid("INVALID_KINDLE_HEADER"));
    }
    for i in 0..count {
        let start = field(78 + i * 8).ok_or_else(|| invalid("INVALID_KINDLE_HEADER"))? as usize;
        let record = data
            .get(start..)
            .ok_or_else(|| invalid("INVALID_KINDLE_HEADER"))?;
        if record.get(16..20) == Some(b"MOBI") {
            if record.get(12..14) != Some(&[0, 0]) {
                return Err(invalid("DRM_NOT_SUPPORTED"));
            }
        } else if i == 0 {
            return Err(invalid("UNSUPPORTED_KINDLE_CONTENT"));
        }
        if record.starts_with(b"%MOP") {
            return Err(invalid("PRINT_REPLICA_NOT_SUPPORTED"));
        }
    }
    Ok(())
}
