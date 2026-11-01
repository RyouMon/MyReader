use serde::{Deserialize, Serialize};

use super::TtsVoiceRef;

pub const NARRATOR_ID: &str = "narrator";

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CharacterSource {
    pub title: String,
    pub url: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BookCharacter {
    #[serde(default)]
    pub id: String,
    pub name: String,
    #[serde(default, alias = "aliases")]
    pub nicknames: Vec<String>,
    #[serde(default, alias = "identity")]
    pub description: String,
    #[serde(default)]
    pub voice: Option<TtsVoiceRef>,
    #[serde(default)]
    pub instructions: String,
    #[serde(default)]
    pub source: Option<CharacterSource>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BookNarrationSettings {
    pub book_id: i64,
    #[serde(default)]
    pub scope_id: String,
    #[serde(default)]
    pub scope_name: Option<String>,
    pub enabled: bool,
    pub revision: u32,
    pub identity_revision: u32,
    pub characters: Vec<BookCharacter>,
    #[serde(default)]
    pub merge_sources: Vec<NarrationMergeSource>,
}

impl BookNarrationSettings {
    pub fn new(book_id: i64) -> Self {
        Self {
            book_id,
            scope_id: format!("book:{book_id}"),
            scope_name: None,
            enabled: false,
            revision: 0,
            identity_revision: 0,
            characters: vec![BookCharacter {
                id: NARRATOR_ID.into(),
                name: NARRATOR_ID.into(),
                nicknames: Vec::new(),
                description: String::new(),
                voice: None,
                instructions: String::new(),
                source: None,
            }],
            merge_sources: Vec::new(),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NarrationMergeSource {
    pub scope_id: String,
    pub title: String,
    pub characters: Vec<BookCharacter>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NarrationMergeChoice {
    pub character_id: String,
    pub target_character_id: Option<String>,
    pub prefer_incoming: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NarrationMergePlan {
    pub scope_id: String,
    pub source_scope_id: String,
    pub revision: u32,
    pub choices: Vec<NarrationMergeChoice>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NarrationRequest {
    pub book_id: i64,
    pub content_version: String,
    pub source_key: String,
    pub position: f64,
    pub text: String,
    #[serde(default)]
    pub before: String,
    #[serde(default)]
    pub after: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NarrationSegment {
    pub start_utf16: u32,
    pub end_utf16: u32,
    pub character_id: String,
    pub delivery: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NarrationPlan {
    pub segments: Vec<NarrationSegment>,
    pub fallback: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NarrationSpeech {
    pub text: String,
    pub start_utf16: u32,
    pub end_utf16: u32,
    pub voice: TtsVoiceRef,
    pub instructions: String,
}

/// One resolved synthesis request, anchored to the original Readium source.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NarrationPlanEntry {
    pub id: String,
    pub source_key: String,
    pub position: f64,
    pub character_id: String,
    pub character_name: String,
    pub speech: NarrationSpeech,
}

impl NarrationPlan {
    pub fn narrator(text: &str) -> Self {
        Self {
            segments: vec![NarrationSegment {
                start_utf16: 0,
                end_utf16: text.encode_utf16().count() as u32,
                character_id: NARRATOR_ID.into(),
                delivery: String::new(),
            }],
            fallback: true,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CharacterImportRequest {
    pub book_id: i64,
    pub title: String,
    pub authors: Vec<String>,
    pub language: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CharacterImportCandidate {
    pub name: String,
    pub nicknames: Vec<String>,
    pub description: String,
    pub source: CharacterSource,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CharacterPassage {
    pub title: String,
    pub text: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum CharacterDraftInput {
    Book { passages: Vec<CharacterPassage> },
    Encyclopedia { source: CharacterSource },
    Prompt { prompt: String },
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CharacterDraftRequest {
    pub book: CharacterImportRequest,
    pub input: CharacterDraftInput,
}
