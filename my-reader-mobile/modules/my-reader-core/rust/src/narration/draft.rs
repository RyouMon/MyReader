use super::types::{BookCharacter, CharacterImportRequest, CharacterSource};
use crate::{llm::LlmCredential, CoreFfiError};
use my_reader_core::{api::narration::NarrationService, models as core};
use std::path::Path;

#[cfg(test)]
mod tests;

#[derive(Debug, Clone, uniffi::Enum)]
pub enum CharacterDraftInput {
    Encyclopedia { source: CharacterSource },
    Book { passages: Vec<CharacterPassage> },
    Prompt { prompt: String },
}

#[derive(Debug, Clone, uniffi::Record)]
pub struct CharacterPassage {
    pub title: String,
    pub text: String,
}

impl TryFrom<CharacterDraftInput> for core::CharacterDraftInput {
    type Error = CoreFfiError;

    fn try_from(value: CharacterDraftInput) -> Result<Self, Self::Error> {
        Ok(match value {
            CharacterDraftInput::Encyclopedia { source } => Self::Encyclopedia {
                source: source.try_into()?,
            },
            CharacterDraftInput::Book { passages } => Self::Book {
                passages: passages
                    .into_iter()
                    .map(|passage| core::CharacterPassage {
                        title: passage.title,
                        text: passage.text,
                    })
                    .collect(),
            },
            CharacterDraftInput::Prompt { prompt } => Self::Prompt { prompt },
        })
    }
}

#[uniffi::export(callback_interface)]
pub trait NarrationDraftProgress: Send + Sync {
    fn on_progress(&self, kind: String, delta: String);
}

#[uniffi::export(async_runtime = "tokio")]
pub async fn narration_search_sources(
    root: String,
    request: CharacterImportRequest,
) -> Result<Vec<CharacterSource>, CoreFfiError> {
    Ok(
        NarrationService::search_character_sources(Path::new(&root), request.try_into()?)
            .await
            .map_err(CoreFfiError::from_core)?
            .into_iter()
            .map(Into::into)
            .collect(),
    )
}

#[uniffi::export(async_runtime = "tokio")]
pub async fn narration_draft_characters(
    root: String,
    config_path: String,
    book: CharacterImportRequest,
    input: CharacterDraftInput,
    credential: Option<LlmCredential>,
    progress: Box<dyn NarrationDraftProgress>,
) -> Result<Vec<BookCharacter>, CoreFfiError> {
    let on_progress = |event| {
        let (kind, delta) = match event {
            core::LlmStreamEvent::Started => ("started", String::new()),
            core::LlmStreamEvent::Reasoning(delta) => ("reasoning", delta),
            core::LlmStreamEvent::Text(delta) => ("text", delta),
        };
        progress.on_progress(kind.into(), delta);
    };
    Ok(NarrationService::draft_characters_with_progress(
        Path::new(&root),
        Path::new(&config_path),
        core::CharacterDraftRequest {
            book: book.try_into()?,
            input: input.try_into()?,
        },
        credential.map(Into::into).as_ref(),
        Some(&on_progress),
    )
    .await
    .map_err(CoreFfiError::from_core)?
    .into_iter()
    .map(Into::into)
    .collect())
}
