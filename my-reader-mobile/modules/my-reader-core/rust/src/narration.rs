#[cfg(test)]
mod tests;
mod types;
use crate::{types::required_i64, CoreFfiError};
use my_reader_core::{api::narration::NarrationService, models::TtsVoiceRef};
use std::path::Path;
use types::*;

#[derive(Debug, Clone, uniffi::Record)]
pub struct NarrationVoice {
    pub engine: String,
    pub profile_id: Option<String>,
    pub voice_id: String,
}

impl TryFrom<NarrationVoice> for TtsVoiceRef {
    type Error = CoreFfiError;
    fn try_from(value: NarrationVoice) -> Result<Self, Self::Error> {
        match value.engine.as_str() {
            "system" => Ok(Self::System {
                voice_id: value.voice_id,
            }),
            "provider" => Ok(Self::Provider {
                profile_id: value
                    .profile_id
                    .ok_or_else(|| CoreFfiError::Config("TTS_PROFILE_REQUIRED".into()))?,
                voice_id: value.voice_id,
            }),
            _ => Err(CoreFfiError::Config("TTS_ENGINE_INVALID".into())),
        }
    }
}
impl From<TtsVoiceRef> for NarrationVoice {
    fn from(value: TtsVoiceRef) -> Self {
        match value {
            TtsVoiceRef::System { voice_id } => Self {
                engine: "system".into(),
                profile_id: None,
                voice_id,
            },
            TtsVoiceRef::Provider {
                profile_id,
                voice_id,
            } => Self {
                engine: "provider".into(),
                profile_id: Some(profile_id),
                voice_id,
            },
        }
    }
}

#[uniffi::export(async_runtime = "tokio")]
pub async fn narration_get_settings(
    root: String,
    book_id: f64,
) -> Result<BookNarrationSettings, CoreFfiError> {
    Ok(
        NarrationService::get_settings(Path::new(&root), required_i64(book_id, "bookId")?)
            .await
            .map_err(CoreFfiError::from_core)?
            .into(),
    )
}
#[uniffi::export(async_runtime = "tokio")]
pub async fn narration_save_settings(
    root: String,
    settings: BookNarrationSettings,
) -> Result<BookNarrationSettings, CoreFfiError> {
    Ok(
        NarrationService::save_settings(Path::new(&root), settings.try_into()?)
            .await
            .map_err(CoreFfiError::from_core)?
            .into(),
    )
}
#[uniffi::export(async_runtime = "tokio")]
pub async fn narration_cancel(root: String, book_id: f64) -> Result<(), CoreFfiError> {
    NarrationService::cancel(Path::new(&root), required_i64(book_id, "bookId")?)
        .await
        .map_err(CoreFfiError::from_core)
}
#[uniffi::export(async_runtime = "tokio")]
pub async fn narration_import(
    root: String,
    config_path: String,
    request: CharacterImportRequest,
    credential: Option<crate::llm::LlmCredential>,
) -> Result<Vec<CharacterImportCandidate>, CoreFfiError> {
    Ok(NarrationService::import_characters(
        Path::new(&root),
        Path::new(&config_path),
        request.try_into()?,
        credential.map(Into::into).as_ref(),
    )
    .await
    .map_err(CoreFfiError::from_core)?
    .into_iter()
    .map(Into::into)
    .collect())
}
#[uniffi::export(async_runtime = "tokio")]
pub async fn narration_prepare(
    root: String,
    config_path: String,
    request: NarrationRequest,
    default_voice: NarrationVoice,
    credential: Option<crate::llm::LlmCredential>,
) -> Result<Vec<NarrationSpeech>, CoreFfiError> {
    Ok(NarrationService::prepare(
        Path::new(&root),
        Path::new(&config_path),
        request.try_into()?,
        default_voice.try_into()?,
        credential.map(Into::into).as_ref(),
    )
    .await
    .map_err(CoreFfiError::from_core)?
    .into_iter()
    .map(Into::into)
    .collect())
}
