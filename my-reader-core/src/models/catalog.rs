use serde::{Deserialize, Serialize};

const READING_FORMAT_PRIORITY: [&str; 3] = ["EPUB", "CBZ", "PDF"];

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadingFormatPolicy {
    pub readable_formats: Vec<String>,
    pub preferred_format: Option<String>,
}

impl ReadingFormatPolicy {
    pub fn normalize(format: &str) -> Option<String> {
        let format = format.trim().to_uppercase();
        Self::is_canonical(&format).then_some(format)
    }

    pub fn is_canonical(format: &str) -> bool {
        READING_FORMAT_PRIORITY.contains(&format)
    }

    pub fn from_formats(formats: &[String]) -> Self {
        let available = formats
            .iter()
            .filter_map(|format| Self::normalize(format))
            .collect::<std::collections::BTreeSet<_>>();
        let readable_formats = READING_FORMAT_PRIORITY
            .iter()
            .filter(|format| available.contains(**format))
            .map(|format| (*format).to_owned())
            .collect::<Vec<_>>();
        let preferred_format = readable_formats.first().cloned();
        Self {
            readable_formats,
            preferred_format,
        }
    }

    pub fn resolve(&self, requested: Option<&str>) -> Option<String> {
        let requested = requested.and_then(Self::normalize);
        requested
            .filter(|format| self.readable_formats.contains(format))
            .or_else(|| {
                self.preferred_format
                    .as_deref()
                    .and_then(Self::normalize)
                    .filter(|format| self.readable_formats.contains(format))
            })
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PaginatedBooks {
    pub items: Vec<BookEntry>,
    pub total: usize,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BookEntry {
    pub id: i64,
    pub title: String,
    pub title_sort: String,
    pub author_sort: String,
    pub authors: Vec<String>,
    pub tags: Vec<String>,
    pub series: Option<String>,
    pub series_index: Option<f64>,
    pub formats: Vec<String>,
    pub has_cover: bool,
    pub path: String,
    pub timestamp: Option<String>,
    pub pubdate: Option<String>,
    pub last_modified: Option<String>,
    pub comment: Option<String>,
    pub publisher: Option<String>,
    pub languages: Vec<String>,
    pub rating: Option<i32>,
    pub uuid: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BookDetail {
    #[serde(flatten)]
    pub book: BookEntry,
    pub format_sizes: Vec<FormatSize>,
    pub identifiers: Vec<BookIdentifier>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FormatSize {
    pub format: String,
    pub size_bytes: i64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BookIdentifier {
    pub id_type: String,
    pub value: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BookSummary {
    pub id: i64,
    pub path: String,
    pub has_cover: bool,
    pub formats: Vec<String>,
    pub format_paths: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BookFormat {
    pub format: String,
    pub name: String,
    pub size_bytes: i64,
    pub relative_path: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct BookFilePathRequest {
    pub book_id: i64,
    pub format: String,
}

#[cfg(test)]
mod tests {
    use super::ReadingFormatPolicy;

    #[test]
    fn should_keep_supported_formats_in_priority_order_when_formats_are_mixed() {
        let policy = ReadingFormatPolicy::from_formats(&[
            "mobi".into(),
            "pdf".into(),
            "EPUB".into(),
            "cbz".into(),
            "epub".into(),
        ]);

        assert_eq!(policy.readable_formats, ["EPUB", "CBZ", "PDF"]);
        assert_eq!(policy.preferred_format.as_deref(), Some("EPUB"));
    }

    #[test]
    fn should_fall_back_to_preferred_format_when_requested_format_is_not_readable() {
        let policy = ReadingFormatPolicy::from_formats(&["PDF".into(), "EPUB".into()]);

        assert_eq!(policy.resolve(Some("mobi")).as_deref(), Some("EPUB"));
        assert_eq!(policy.resolve(Some("pdf")).as_deref(), Some("PDF"));
    }

    #[test]
    fn should_distinguish_normalized_input_from_canonical_format_when_format_is_validated() {
        assert_eq!(
            ReadingFormatPolicy::normalize(" pdf ").as_deref(),
            Some("PDF")
        );
        assert!(ReadingFormatPolicy::is_canonical("EPUB"));
        assert!(!ReadingFormatPolicy::is_canonical("epub"));
        assert!(!ReadingFormatPolicy::is_canonical("MOBI"));
    }
}
