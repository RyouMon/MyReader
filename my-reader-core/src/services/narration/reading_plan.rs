use super::*;
use crate::models::{NarrationPlanEntry, NarrationSpeech, TtsProviderProfile, TtsVoiceRef};

impl NarrationService {
    /// Analyze source units together, independent of voice selection and synthesis.
    pub async fn analyze_batch(
        root: &Path,
        config_path: &Path,
        requests: Vec<NarrationRequest>,
        credential: Option<&crate::models::LlmCredential>,
    ) -> Result<(), CoreError> {
        let first = requests.first().ok_or_else(|| error("REQUEST_INVALID"))?;
        if requests.len() > 10000
            || requests.iter().map(|r| r.text.len()).sum::<usize>() > 8_000_000
        {
            return Err(error("REQUEST_INVALID"));
        }
        let mut sources = HashSet::new();
        for request in &requests {
            validate_request(request)?;
            if request.book_id != first.book_id
                || request.content_version != first.content_version
                || !sources.insert(&request.source_key)
            {
                return Err(error("REQUEST_INVALID"));
            }
        }
        if requests
            .windows(2)
            .any(|pair| pair[0].position > pair[1].position)
        {
            return Err(error("REQUEST_INVALID"));
        }
        let context = LibraryContext::open(root).await?;
        let repository = NarrationRepository::new(context.database());
        let session = repository
            .session(first.book_id, &first.content_version)
            .await?;
        let lock = book_lock(&format!("{}:{}", context.path(), first.book_id));
        let _guard = lock.lock().await;
        let settings = repository.settings(first.book_id).await?;
        if !settings.enabled {
            return Ok(());
        }
        if !settings.merge_sources.is_empty() {
            return Err(error("MERGE_REQUIRED"));
        }
        let profile = LlmService::selected_profile(config_path)?;
        let credential = credential_for(&profile, credential)?;
        let output = output_limit(&profile);
        let memory_reserve = (profile.context_window / 4).min(7168);
        let input_budget = (profile
            .context_window
            .saturating_sub(output + memory_reserve + 1024) as usize)
            .saturating_sub(prompt(&settings, "").content.len());
        let unit_limit = (output as usize / 96).max(1);
        let mut index = 0;
        while index < requests.len() {
            let active = repository
                .session(first.book_id, &first.content_version)
                .await?;
            if active.epoch != session.epoch
                || LlmService::selected_profile(config_path)? != profile
            {
                return Err(error("STALE_REQUEST"));
            }
            let request = &requests[index];
            let key = cache_key(
                request,
                &profile,
                settings.identity_revision,
                &settings.scope_id,
            )?;
            if repository.cached(&session, &key).await?.is_some() {
                index += 1;
                continue;
            }
            let mut end = index;
            let mut bytes = 0;
            while end < requests.len() && end - index < unit_limit {
                let size = serde_json::to_string(&requests[end].text)?.len() + 48;
                if bytes + size > input_budget {
                    break;
                }
                bytes += size;
                end += 1;
            }
            if end == index {
                return Err(error("CONTEXT_LIMIT"));
            }
            let checkpoint = repository
                .checkpoint(
                    &session,
                    request.position,
                    settings.identity_revision,
                    &settings.scope_id,
                )
                .await?;
            let history = repository
                .history(
                    &session,
                    request.position,
                    checkpoint.through_seq,
                    checkpoint.position,
                    settings.identity_revision,
                    &settings.scope_id,
                )
                .await?;
            let (plans, checkpoint) = analyze(
                &profile,
                credential,
                &settings,
                &requests[index..end],
                checkpoint.summary,
                &history,
            )
            .await?;
            if LlmService::selected_profile(config_path)? != profile {
                return Err(error("STALE_REQUEST"));
            }
            for (request, plan) in requests[index..end].iter().zip(plans) {
                let key = cache_key(
                    request,
                    &profile,
                    settings.identity_revision,
                    &settings.scope_id,
                )?;
                repository
                    .commit(
                        &session,
                        &settings,
                        &key,
                        request,
                        &plan,
                        checkpoint.clone(),
                    )
                    .await?;
            }
            index = end;
        }
        Ok(())
    }

    pub async fn reading_plan(
        root: &Path,
        config_path: &Path,
        book_id: i64,
        content_version: &str,
        default_voice: TtsVoiceRef,
    ) -> Result<Vec<NarrationPlanEntry>, CoreError> {
        let context = LibraryContext::open(root).await?;
        let repository = NarrationRepository::new(context.database());
        let settings = repository.settings(book_id).await?;
        let session = repository.session(book_id, content_version).await?;
        let profile = LlmService::selected_profile(config_path)?;
        let mut result = Vec::new();
        let profiles = super::super::tts::TtsService::get_config(config_path)?.profiles();
        for entry in repository.entries(&session, &settings).await? {
            if entry.cache_key
                != cache_key(
                    &entry.request,
                    &profile,
                    settings.identity_revision,
                    &settings.scope_id,
                )?
            {
                continue;
            }
            result.extend(resolve(
                &profiles,
                &entry.request,
                &entry.plan,
                &settings,
                &default_voice,
                &entry.cache_key,
            )?);
        }
        Ok(result)
    }

    pub async fn clear_reading_plan(
        root: &Path,
        book_id: i64,
        content_version: &str,
        ids: Vec<String>,
    ) -> Result<(), CoreError> {
        let context = LibraryContext::open(root).await?;
        let repository = NarrationRepository::new(context.database());
        let session = repository.session(book_id, content_version).await?;
        let ranges = ids
            .iter()
            .map(|id| {
                let parts = id.split(':').collect::<Vec<_>>();
                if parts.len() != 3 {
                    return Err(error("REQUEST_INVALID"));
                }
                let start = parts[1]
                    .parse::<u32>()
                    .map_err(|_| error("REQUEST_INVALID"))?;
                let end = parts[2]
                    .parse::<u32>()
                    .map_err(|_| error("REQUEST_INVALID"))?;
                if start >= end {
                    return Err(error("REQUEST_INVALID"));
                }
                Ok((parts[0].to_owned(), start, end))
            })
            .collect::<Result<Vec<_>, CoreError>>()?;
        repository.clear(&session, &ranges).await
    }
}

pub(super) fn resolve(
    profiles: &[TtsProviderProfile],
    request: &NarrationRequest,
    plan: &NarrationPlan,
    settings: &BookNarrationSettings,
    default_voice: &TtsVoiceRef,
    key: &str,
) -> Result<Vec<NarrationPlanEntry>, CoreError> {
    let narrator = settings
        .characters
        .iter()
        .find(|c| c.id == NARRATOR_ID)
        .ok_or_else(|| error("NARRATOR_REQUIRED"))?;
    let source: Vec<u16> = request.text.encode_utf16().collect();
    let mut runs: Vec<NarrationPlanEntry> = Vec::new();
    for segment in &plan.segments {
        let character = settings
            .characters
            .iter()
            .find(|c| c.id == segment.character_id)
            .unwrap_or(narrator);
        // Role settings sync across devices; an unavailable local model inherits the reader voice.
        let voice = character
            .voice
            .as_ref()
            .filter(|voice| match voice {
                TtsVoiceRef::Provider { profile_id, .. } => {
                    profiles.iter().any(|profile| profile.id == *profile_id)
                }
                TtsVoiceRef::System { .. } => true,
            })
            .unwrap_or(default_voice);
        let instructions = [character.instructions.as_str(), segment.delivery.as_str()]
            .into_iter()
            .filter(|v| !v.trim().is_empty())
            .collect::<Vec<_>>()
            .join("\n");
        let text = source
            .get(segment.start_utf16 as usize..segment.end_utf16 as usize)
            .and_then(|s| String::from_utf16(s).ok())
            .ok_or_else(|| error("PLAN_INVALID"))?;
        if let Some(previous) = runs.last_mut() {
            if previous.speech.end_utf16 == segment.start_utf16
                && previous.character_id == character.id
                && previous.speech.voice == *voice
                && previous.speech.instructions == instructions
            {
                previous.speech.text.push_str(&text);
                previous.speech.end_utf16 = segment.end_utf16;
                continue;
            }
        }
        runs.push(NarrationPlanEntry {
            id: String::new(),
            source_key: request.source_key.clone(),
            position: request.position,
            character_id: character.id.clone(),
            character_name: character.name.clone(),
            speech: NarrationSpeech {
                text,
                start_utf16: segment.start_utf16,
                end_utf16: segment.end_utf16,
                voice: voice.clone(),
                instructions,
            },
        });
    }
    let mut result = Vec::new();
    for run in runs {
        let voice = &run.speech.voice;
        let limit = match voice {
            TtsVoiceRef::Provider { profile_id, .. } => profiles
                .iter()
                .find(|profile| profile.id == *profile_id)
                .map(crate::infrastructure::tts::capabilities)
                .and_then(|c| c.max_input_chars)
                .unwrap_or(4096) as usize,
            TtsVoiceRef::System { .. } => 4096,
        };
        let mut start = run.speech.start_utf16;
        for text in split_text(&run.speech.text, limit) {
            let end = start + text.encode_utf16().count() as u32;
            result.push(NarrationPlanEntry {
                id: format!("{key}:{start}:{end}"),
                speech: NarrationSpeech {
                    text: text.to_owned(),
                    start_utf16: start,
                    end_utf16: end,
                    ..run.speech.clone()
                },
                ..run.clone()
            });
            start = end;
        }
    }
    Ok(result)
}

fn split_text(mut text: &str, limit: usize) -> Vec<&str> {
    let mut chunks = Vec::new();
    while !text.is_empty() {
        let end = text
            .char_indices()
            .nth(limit)
            .map(|(i, _)| i)
            .unwrap_or(text.len());
        let end = if end < text.len() {
            text[..end]
                .char_indices()
                .filter(|(_, c)| c.is_whitespace() || "。！？；.!?;".contains(*c))
                .map(|(i, c)| i + c.len_utf8())
                .next_back()
                .filter(|i| *i >= end / 2)
                .unwrap_or(end)
        } else {
            end
        };
        chunks.push(&text[..end]);
        text = &text[end..];
    }
    chunks
}
