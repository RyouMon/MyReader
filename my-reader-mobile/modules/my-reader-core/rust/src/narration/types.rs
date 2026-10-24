use super::NarrationVoice;
use crate::{types::required_i64, CoreFfiError};
use my_reader_core::models as core;
#[derive(Debug, Clone, uniffi::Record)]
pub struct CharacterSource {
    pub title: String,
    pub url: String,
}
impl From<core::CharacterSource> for CharacterSource {
    fn from(value: core::CharacterSource) -> Self {
        Self {
            title: value.title,
            url: value.url,
        }
    }
}
impl TryFrom<CharacterSource> for core::CharacterSource {
    type Error = CoreFfiError;
    fn try_from(value: CharacterSource) -> Result<Self, Self::Error> {
        Ok(Self {
            title: value.title,
            url: value.url,
        })
    }
}
#[derive(Debug, Clone, uniffi::Record)]
pub struct BookCharacter {
    pub id: String,
    pub name: String,
    pub aliases: Vec<String>,
    pub identity: String,
    pub voice: Option<NarrationVoice>,
    pub instructions: String,
    pub source: Option<CharacterSource>,
}
impl From<core::BookCharacter> for BookCharacter {
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
impl TryFrom<BookCharacter> for core::BookCharacter {
    type Error = CoreFfiError;
    fn try_from(value: BookCharacter) -> Result<Self, Self::Error> {
        Ok(Self {
            id: value.id,
            name: value.name,
            aliases: value.aliases,
            identity: value.identity,
            voice: value.voice.map(TryInto::try_into).transpose()?,
            instructions: value.instructions,
            source: value.source.map(TryInto::try_into).transpose()?,
        })
    }
}
#[derive(Debug, Clone, uniffi::Record)]
pub struct BookNarrationSettings {
    pub book_id: f64,
    pub scope_id: String,
    pub scope_name: Option<String>,
    pub merge_sources: Vec<NarrationMergeSource>,
    pub enabled: bool,
    pub revision: u32,
    pub identity_revision: u32,
    pub characters: Vec<BookCharacter>,
}
impl From<core::BookNarrationSettings> for BookNarrationSettings {
    fn from(value: core::BookNarrationSettings) -> Self {
        Self {
            book_id: value.book_id as f64,
            scope_id: value.scope_id,
            scope_name: value.scope_name,
            merge_sources: value.merge_sources.into_iter().map(Into::into).collect(),
            enabled: value.enabled,
            revision: value.revision,
            identity_revision: value.identity_revision,
            characters: value.characters.into_iter().map(Into::into).collect(),
        }
    }
}
impl TryFrom<BookNarrationSettings> for core::BookNarrationSettings {
    type Error = CoreFfiError;
    fn try_from(value: BookNarrationSettings) -> Result<Self, Self::Error> {
        Ok(Self {
            book_id: required_i64(value.book_id, "bookId")?,
            scope_id: value.scope_id,
            scope_name: value.scope_name,
            merge_sources: value
                .merge_sources
                .into_iter()
                .map(TryInto::try_into)
                .collect::<Result<_, _>>()?,
            enabled: value.enabled,
            revision: value.revision,
            identity_revision: value.identity_revision,
            characters: value
                .characters
                .into_iter()
                .map(TryInto::try_into)
                .collect::<Result<_, _>>()?,
        })
    }
}
#[derive(Debug, Clone, uniffi::Record)]
pub struct NarrationRequest {
    pub book_id: f64,
    pub content_version: String,
    pub source_key: String,
    pub position: f64,
    pub text: String,
    pub before: String,
    pub after: String,
}
impl From<core::NarrationRequest> for NarrationRequest {
    fn from(value: core::NarrationRequest) -> Self {
        Self {
            book_id: value.book_id as f64,
            content_version: value.content_version,
            source_key: value.source_key,
            position: value.position,
            text: value.text,
            before: value.before,
            after: value.after,
        }
    }
}
impl TryFrom<NarrationRequest> for core::NarrationRequest {
    type Error = CoreFfiError;
    fn try_from(value: NarrationRequest) -> Result<Self, Self::Error> {
        Ok(Self {
            book_id: required_i64(value.book_id, "bookId")?,
            content_version: value.content_version,
            source_key: value.source_key,
            position: value.position,
            text: value.text,
            before: value.before,
            after: value.after,
        })
    }
}
#[derive(Debug, Clone, uniffi::Record)]
pub struct CharacterImportRequest {
    pub book_id: f64,
    pub title: String,
    pub authors: Vec<String>,
    pub language: String,
}
impl From<core::CharacterImportRequest> for CharacterImportRequest {
    fn from(value: core::CharacterImportRequest) -> Self {
        Self {
            book_id: value.book_id as f64,
            title: value.title,
            authors: value.authors,
            language: value.language,
        }
    }
}
impl TryFrom<CharacterImportRequest> for core::CharacterImportRequest {
    type Error = CoreFfiError;
    fn try_from(value: CharacterImportRequest) -> Result<Self, Self::Error> {
        Ok(Self {
            book_id: required_i64(value.book_id, "bookId")?,
            title: value.title,
            authors: value.authors,
            language: value.language,
        })
    }
}
#[derive(Debug, Clone, uniffi::Record)]
pub struct CharacterImportCandidate {
    pub name: String,
    pub aliases: Vec<String>,
    pub identity: String,
    pub source: CharacterSource,
}
impl From<core::CharacterImportCandidate> for CharacterImportCandidate {
    fn from(value: core::CharacterImportCandidate) -> Self {
        Self {
            name: value.name,
            aliases: value.aliases,
            identity: value.identity,
            source: value.source.into(),
        }
    }
}
impl TryFrom<CharacterImportCandidate> for core::CharacterImportCandidate {
    type Error = CoreFfiError;
    fn try_from(value: CharacterImportCandidate) -> Result<Self, Self::Error> {
        Ok(Self {
            name: value.name,
            aliases: value.aliases,
            identity: value.identity,
            source: value.source.try_into()?,
        })
    }
}
#[derive(Debug, Clone, uniffi::Record)]
pub struct NarrationSpeech {
    pub text: String,
    pub start_utf16: u32,
    pub end_utf16: u32,
    pub voice: NarrationVoice,
    pub instructions: String,
}
impl From<core::NarrationSpeech> for NarrationSpeech {
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
impl TryFrom<NarrationSpeech> for core::NarrationSpeech {
    type Error = CoreFfiError;
    fn try_from(value: NarrationSpeech) -> Result<Self, Self::Error> {
        Ok(Self {
            text: value.text,
            start_utf16: value.start_utf16,
            end_utf16: value.end_utf16,
            voice: value.voice.try_into()?,
            instructions: value.instructions,
        })
    }
}

#[derive(Debug, Clone, uniffi::Record)]
pub struct NarrationMergeSource {
    pub scope_id: String,
    pub title: String,
    pub characters: Vec<BookCharacter>,
}
impl From<core::NarrationMergeSource> for NarrationMergeSource {
    fn from(value: core::NarrationMergeSource) -> Self {
        Self {
            scope_id: value.scope_id,
            title: value.title,
            characters: value.characters.into_iter().map(Into::into).collect(),
        }
    }
}
impl TryFrom<NarrationMergeSource> for core::NarrationMergeSource {
    type Error = CoreFfiError;
    fn try_from(value: NarrationMergeSource) -> Result<Self, Self::Error> {
        Ok(Self {
            scope_id: value.scope_id,
            title: value.title,
            characters: value
                .characters
                .into_iter()
                .map(TryInto::try_into)
                .collect::<Result<_, _>>()?,
        })
    }
}

#[derive(Debug, Clone, uniffi::Record)]
pub struct NarrationMergeChoice {
    pub character_id: String,
    pub target_character_id: Option<String>,
    pub prefer_incoming: bool,
}
impl From<core::NarrationMergeChoice> for NarrationMergeChoice {
    fn from(value: core::NarrationMergeChoice) -> Self {
        Self {
            character_id: value.character_id,
            target_character_id: value.target_character_id,
            prefer_incoming: value.prefer_incoming,
        }
    }
}
impl TryFrom<NarrationMergeChoice> for core::NarrationMergeChoice {
    type Error = CoreFfiError;
    fn try_from(value: NarrationMergeChoice) -> Result<Self, Self::Error> {
        Ok(Self {
            character_id: value.character_id,
            target_character_id: value.target_character_id,
            prefer_incoming: value.prefer_incoming,
        })
    }
}

#[derive(Debug, Clone, uniffi::Record)]
pub struct NarrationMergePlan {
    pub scope_id: String,
    pub source_scope_id: String,
    pub revision: u32,
    pub choices: Vec<NarrationMergeChoice>,
}
impl From<core::NarrationMergePlan> for NarrationMergePlan {
    fn from(value: core::NarrationMergePlan) -> Self {
        Self {
            scope_id: value.scope_id,
            source_scope_id: value.source_scope_id,
            revision: value.revision,
            choices: value.choices.into_iter().map(Into::into).collect(),
        }
    }
}
impl TryFrom<NarrationMergePlan> for core::NarrationMergePlan {
    type Error = CoreFfiError;
    fn try_from(value: NarrationMergePlan) -> Result<Self, Self::Error> {
        Ok(Self {
            scope_id: value.scope_id,
            source_scope_id: value.source_scope_id,
            revision: value.revision,
            choices: value
                .choices
                .into_iter()
                .map(TryInto::try_into)
                .collect::<Result<_, _>>()?,
        })
    }
}
