use serde::{Deserialize, Serialize};

use super::TtsVoiceRef;

/// Effective voice IDs for a model in the edited provider.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TtsModelVoices {
    pub id: String,
    pub voices: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TtsSelectionUsage {
    pub profile_id: String,
    pub voice_id: Option<String>,
    pub language: Option<String>,
    pub library_name: Option<String>,
    pub scope_name: Option<String>,
    pub book_id: Option<i64>,
    pub character_name: Option<String>,
}

pub(crate) struct RemovedTtsSelection {
    pub profile_id: String,
    /// None means the entire model was removed.
    pub voices: Option<Vec<String>>,
}

impl RemovedTtsSelection {
    pub(crate) fn matches(&self, voice: &TtsVoiceRef) -> bool {
        matches!(voice, TtsVoiceRef::Provider { profile_id, voice_id }
            if profile_id == &self.profile_id
                && self.voices.as_ref().is_none_or(|voices| voices.contains(voice_id)))
    }
}
