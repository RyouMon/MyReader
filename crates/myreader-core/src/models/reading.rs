#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadingPosition {
    pub book_id: i64,
    pub format: String,
    pub locator: serde_json::Value,
    pub display_progression: Option<f64>,
    pub updated_at: f64,
    pub conflict_count: i64,
}

#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadingPositionCandidate {
    pub operation_id: String,
    pub locator: serde_json::Value,
    pub display_progression: Option<f64>,
    pub recorded_at: i64,
    pub replica_id: String,
}

#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReaderBookmark {
    pub id: String,
    pub book_id: i64,
    pub format: String,
    pub locator_key: String,
    pub locator: serde_json::Value,
    pub created_at: f64,
    pub updated_at: f64,
}

#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReaderAnnotation {
    pub id: String,
    pub book_id: i64,
    pub format: String,
    pub kind: String,
    pub locator: serde_json::Value,
    pub color: String,
    pub note: Option<String>,
    pub created_at: f64,
    pub updated_at: f64,
}
