use serde::{Deserialize, Serialize};
use specta::Type;

#[derive(Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct TtsModelVoicesDto {
    pub id: String,
    pub voices: Vec<String>,
}

#[derive(Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct TtsSelectionUsageDto {
    pub profile_id: String,
    pub voice_id: Option<String>,
    pub language: Option<String>,
    pub library_name: Option<String>,
    pub scope_name: Option<String>,
    pub book_id: Option<i64>,
    pub character_name: Option<String>,
}

impl From<my_reader_core::models::TtsSelectionUsage> for TtsSelectionUsageDto {
    fn from(value: my_reader_core::models::TtsSelectionUsage) -> Self {
        Self {
            profile_id: value.profile_id,
            voice_id: value.voice_id,
            language: value.language,
            library_name: value.library_name,
            scope_name: value.scope_name,
            book_id: value.book_id,
            character_name: value.character_name,
        }
    }
}
