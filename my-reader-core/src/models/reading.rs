#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
#[cfg_attr(feature = "typescript-contract", derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct ReadingPosition {
    pub book_id: i64,
    pub format: String,
    #[cfg_attr(
        feature = "typescript-contract",
        specta(type = crate::models::typescript_contract::ReaderLocator)
    )]
    pub locator: serde_json::Value,
    pub display_progression: Option<f64>,
    pub updated_at: f64,
    pub conflict_count: i64,
}

#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
#[cfg_attr(feature = "typescript-contract", derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct ReadingPositionCandidate {
    pub operation_id: String,
    #[cfg_attr(
        feature = "typescript-contract",
        specta(type = crate::models::typescript_contract::ReaderLocator)
    )]
    pub locator: serde_json::Value,
    pub display_progression: Option<f64>,
    pub recorded_at: i64,
    pub replica_id: String,
}

#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
#[cfg_attr(feature = "typescript-contract", derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct ReaderBookmark {
    pub id: String,
    pub book_id: i64,
    pub format: String,
    pub locator_key: String,
    #[cfg_attr(
        feature = "typescript-contract",
        specta(type = crate::models::typescript_contract::ReaderLocator)
    )]
    pub locator: serde_json::Value,
    pub created_at: f64,
    pub updated_at: f64,
}

#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
#[cfg_attr(feature = "typescript-contract", derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct ReaderAnnotation {
    pub id: String,
    pub book_id: i64,
    pub format: String,
    #[cfg_attr(
        feature = "typescript-contract",
        specta(type = crate::models::typescript_contract::ReaderAnnotationKind)
    )]
    pub kind: String,
    #[cfg_attr(
        feature = "typescript-contract",
        specta(type = crate::models::typescript_contract::ReaderLocator)
    )]
    pub locator: serde_json::Value,
    #[cfg_attr(
        feature = "typescript-contract",
        specta(type = crate::models::typescript_contract::ReaderAnnotationColor)
    )]
    pub color: String,
    pub note: Option<String>,
    pub created_at: f64,
    pub updated_at: f64,
}

#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
#[cfg_attr(feature = "typescript-contract", derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct ReadingStatistics {
    pub days: BTreeMap<String, i64>,
    pub total_duration_seconds: i64,
    pub longest_streak_days: u32,
    pub completed_books: usize,
}

#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LegacyFinishedReading {
    pub book_id: i64,
    pub format: String,
    pub updated_at: f64,
}
use std::collections::BTreeMap;
