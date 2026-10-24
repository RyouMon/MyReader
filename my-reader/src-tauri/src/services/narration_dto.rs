use super::tts_service::TtsVoiceRefDto;
use my_reader_core::models as core;
use serde::{Deserialize, Serialize};
use specta::Type;
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct CharacterSourceDto {
    pub title: String,
    pub url: String,
}
impl From<core::CharacterSource> for CharacterSourceDto {
    fn from(value: core::CharacterSource) -> Self {
        Self {
            title: value.title,
            url: value.url,
        }
    }
}
impl From<CharacterSourceDto> for core::CharacterSource {
    fn from(value: CharacterSourceDto) -> Self {
        Self {
            title: value.title,
            url: value.url,
        }
    }
}
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct BookCharacterDto {
    pub id: String,
    pub name: String,
    pub aliases: Vec<String>,
    pub identity: String,
    pub voice: Option<TtsVoiceRefDto>,
    pub instructions: String,
    pub source: Option<CharacterSourceDto>,
}
impl From<core::BookCharacter> for BookCharacterDto {
    fn from(value: core::BookCharacter) -> Self {
        Self {
            id: value.id,
            name: value.name,
            aliases: value.aliases,
            identity: value.identity,
            voice: value.voice.map(Into::into),
            instructions: value.instructions,
            source: value.source.map(Into::into),
        }
    }
}
impl From<BookCharacterDto> for core::BookCharacter {
    fn from(value: BookCharacterDto) -> Self {
        Self {
            id: value.id,
            name: value.name,
            aliases: value.aliases,
            identity: value.identity,
            voice: value.voice.map(Into::into),
            instructions: value.instructions,
            source: value.source.map(Into::into),
        }
    }
}
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct BookNarrationSettingsDto {
    pub book_id: i64,
    pub enabled: bool,
    pub revision: u32,
    pub identity_revision: u32,
    pub characters: Vec<BookCharacterDto>,
}
impl From<core::BookNarrationSettings> for BookNarrationSettingsDto {
    fn from(value: core::BookNarrationSettings) -> Self {
        Self {
            book_id: value.book_id,
            enabled: value.enabled,
            revision: value.revision,
            identity_revision: value.identity_revision,
            characters: value.characters.into_iter().map(Into::into).collect(),
        }
    }
}
impl From<BookNarrationSettingsDto> for core::BookNarrationSettings {
    fn from(value: BookNarrationSettingsDto) -> Self {
        Self {
            book_id: value.book_id,
            enabled: value.enabled,
            revision: value.revision,
            identity_revision: value.identity_revision,
            characters: value.characters.into_iter().map(Into::into).collect(),
        }
    }
}
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct NarrationRequestDto {
    pub book_id: i64,
    pub content_version: String,
    pub source_key: String,
    pub position: f64,
    pub text: String,
    pub before: String,
    pub after: String,
}
impl From<core::NarrationRequest> for NarrationRequestDto {
    fn from(value: core::NarrationRequest) -> Self {
        Self {
            book_id: value.book_id,
            content_version: value.content_version,
            source_key: value.source_key,
            position: value.position,
            text: value.text,
            before: value.before,
            after: value.after,
        }
    }
}
impl From<NarrationRequestDto> for core::NarrationRequest {
    fn from(value: NarrationRequestDto) -> Self {
        Self {
            book_id: value.book_id,
            content_version: value.content_version,
            source_key: value.source_key,
            position: value.position,
            text: value.text,
            before: value.before,
            after: value.after,
        }
    }
}
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct CharacterImportRequestDto {
    pub book_id: i64,
    pub title: String,
    pub authors: Vec<String>,
    pub language: String,
}
impl From<core::CharacterImportRequest> for CharacterImportRequestDto {
    fn from(value: core::CharacterImportRequest) -> Self {
        Self {
            book_id: value.book_id,
            title: value.title,
            authors: value.authors,
            language: value.language,
        }
    }
}
impl From<CharacterImportRequestDto> for core::CharacterImportRequest {
    fn from(value: CharacterImportRequestDto) -> Self {
        Self {
            book_id: value.book_id,
            title: value.title,
            authors: value.authors,
            language: value.language,
        }
    }
}
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct CharacterImportCandidateDto {
    pub name: String,
    pub aliases: Vec<String>,
    pub identity: String,
    pub source: CharacterSourceDto,
}
impl From<core::CharacterImportCandidate> for CharacterImportCandidateDto {
    fn from(value: core::CharacterImportCandidate) -> Self {
        Self {
            name: value.name,
            aliases: value.aliases,
            identity: value.identity,
            source: value.source.into(),
        }
    }
}
impl From<CharacterImportCandidateDto> for core::CharacterImportCandidate {
    fn from(value: CharacterImportCandidateDto) -> Self {
        Self {
            name: value.name,
            aliases: value.aliases,
            identity: value.identity,
            source: value.source.into(),
        }
    }
}
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct NarrationSpeechDto {
    pub text: String,
    pub start_utf16: u32,
    pub end_utf16: u32,
    pub voice: TtsVoiceRefDto,
    pub instructions: String,
}
impl From<core::NarrationSpeech> for NarrationSpeechDto {
    fn from(value: core::NarrationSpeech) -> Self {
        Self {
            text: value.text,
            start_utf16: value.start_utf16,
            end_utf16: value.end_utf16,
            voice: value.voice.into(),
            instructions: value.instructions,
        }
    }
}
impl From<NarrationSpeechDto> for core::NarrationSpeech {
    fn from(value: NarrationSpeechDto) -> Self {
        Self {
            text: value.text,
            start_utf16: value.start_utf16,
            end_utf16: value.end_utf16,
            voice: value.voice.into(),
            instructions: value.instructions,
        }
    }
}
