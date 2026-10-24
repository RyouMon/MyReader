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
    #[serde(default)]
    pub aliases: Vec<String>,
    #[serde(default)]
    pub identity: String,
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
    pub enabled: bool,
    pub revision: u32,
    pub identity_revision: u32,
    pub characters: Vec<BookCharacter>,
}

impl BookNarrationSettings {
    pub fn new(book_id: i64) -> Self {
        Self {
            book_id,
            enabled: false,
            revision: 0,
            identity_revision: 0,
            characters: vec![BookCharacter {
                id: NARRATOR_ID.into(),
                name: NARRATOR_ID.into(),
                aliases: Vec::new(),
                identity: String::new(),
                voice: None,
                instructions: String::new(),
                source: None,
            }],
        }
    }
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
    pub aliases: Vec<String>,
    pub identity: String,
    pub source: CharacterSource,
}
