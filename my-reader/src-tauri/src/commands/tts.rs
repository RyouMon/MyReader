use std::{
    collections::{HashMap, HashSet, VecDeque},
    sync::Mutex,
};

use tauri::{AppHandle, Manager, State};
use tokio::sync::oneshot;

use crate::{
    commands::common,
    error::AppError,
    services::tts_service::{
        DesktopTtsService, TtsAudioArtifactDto, TtsConfigDto, TtsEngineSelectionDto,
        TtsPlaybackPreferencesDto, TtsProviderCapabilitiesDto, TtsSynthesisInput, TtsVoiceDto,
        TtsVoiceRefDto, UpsertTtsProviderInput,
    },
};

const MAX_PENDING_TTS_CANCELLATIONS: usize = 128;

#[derive(Default)]
struct TtsSynthesisState {
    active: HashMap<String, oneshot::Sender<()>>,
    pending_cancellations: HashSet<String>,
    pending_order: VecDeque<String>,
}

#[derive(Default)]
pub struct TtsSynthesisCoordinator {
    state: Mutex<TtsSynthesisState>,
}

impl TtsSynthesisCoordinator {
    fn start(&self, request_id: &str) -> Option<oneshot::Receiver<()>> {
        let mut state = self.state.lock().unwrap_or_else(|error| error.into_inner());
        if state.pending_cancellations.remove(request_id) {
            state.pending_order.retain(|id| id != request_id);
            return None;
        }
        let (sender, receiver) = oneshot::channel();
        if let Some(previous) = state.active.insert(request_id.to_owned(), sender) {
            let _ = previous.send(());
        }
        Some(receiver)
    }

    fn finish(&self, request_id: &str) {
        self.state
            .lock()
            .unwrap_or_else(|error| error.into_inner())
            .active
            .remove(request_id);
    }

    pub fn cancel(&self, request_id: &str) -> bool {
        let mut state = self.state.lock().unwrap_or_else(|error| error.into_inner());
        if let Some(sender) = state.active.remove(request_id) {
            let _ = sender.send(());
            return true;
        }
        if state.pending_cancellations.insert(request_id.to_owned()) {
            state.pending_order.push_back(request_id.to_owned());
        }
        while state.pending_order.len() > MAX_PENDING_TTS_CANCELLATIONS {
            if let Some(expired) = state.pending_order.pop_front() {
                state.pending_cancellations.remove(&expired);
            }
        }
        true
    }
}

#[tauri::command]
#[specta::specta]
pub fn get_tts_config<R: tauri::Runtime>(app: AppHandle<R>) -> Result<TtsConfigDto, AppError> {
    let app_data_dir = common::app_data_dir(&app)?;
    DesktopTtsService::get_config(&crate::config::config_path(&app_data_dir))
}

#[tauri::command]
#[specta::specta]
pub fn upsert_tts_profile<R: tauri::Runtime>(
    app: AppHandle<R>,
    input: UpsertTtsProviderInput,
) -> Result<TtsConfigDto, AppError> {
    let app_data_dir = common::app_data_dir(&app)?;
    DesktopTtsService::upsert_profile(&crate::config::config_path(&app_data_dir), input)
}

#[tauri::command]
#[specta::specta]
pub fn remove_tts_profile<R: tauri::Runtime>(
    app: AppHandle<R>,
    profile_id: String,
) -> Result<TtsConfigDto, AppError> {
    let app_data_dir = common::app_data_dir(&app)?;
    DesktopTtsService::remove_profile(&crate::config::config_path(&app_data_dir), &profile_id)
}

#[tauri::command]
#[specta::specta]
pub fn set_tts_default_engine<R: tauri::Runtime>(
    app: AppHandle<R>,
    engine: TtsEngineSelectionDto,
) -> Result<TtsConfigDto, AppError> {
    let app_data_dir = common::app_data_dir(&app)?;
    DesktopTtsService::set_default_engine(&crate::config::config_path(&app_data_dir), engine)
}

#[tauri::command]
#[specta::specta]
pub fn set_tts_playback_preferences<R: tauri::Runtime>(
    app: AppHandle<R>,
    playback: TtsPlaybackPreferencesDto,
) -> Result<TtsConfigDto, AppError> {
    let app_data_dir = common::app_data_dir(&app)?;
    DesktopTtsService::set_playback_preferences(
        &crate::config::config_path(&app_data_dir),
        playback,
    )
}

#[tauri::command]
#[specta::specta]
pub fn set_tts_voice_for_language<R: tauri::Runtime>(
    app: AppHandle<R>,
    language: String,
    voice: Option<TtsVoiceRefDto>,
) -> Result<TtsConfigDto, AppError> {
    let app_data_dir = common::app_data_dir(&app)?;
    DesktopTtsService::set_voice_for_language(
        &crate::config::config_path(&app_data_dir),
        &language,
        voice,
    )
}

#[tauri::command]
#[specta::specta]
pub fn get_tts_provider_capabilities<R: tauri::Runtime>(
    app: AppHandle<R>,
    profile_id: String,
) -> Result<TtsProviderCapabilitiesDto, AppError> {
    let app_data_dir = common::app_data_dir(&app)?;
    DesktopTtsService::provider_capabilities(
        &crate::config::config_path(&app_data_dir),
        &profile_id,
    )
}

#[tauri::command]
#[specta::specta]
pub async fn probe_tts_provider<R: tauri::Runtime>(
    app: AppHandle<R>,
    profile_id: String,
) -> Result<TtsProviderCapabilitiesDto, AppError> {
    let app_data_dir = common::app_data_dir(&app)?;
    DesktopTtsService::probe_provider(&crate::config::config_path(&app_data_dir), &profile_id).await
}

#[tauri::command]
#[specta::specta]
pub async fn list_tts_voices<R: tauri::Runtime>(
    app: AppHandle<R>,
    profile_id: String,
) -> Result<Vec<TtsVoiceDto>, AppError> {
    let app_data_dir = common::app_data_dir(&app)?;
    DesktopTtsService::list_voices(&crate::config::config_path(&app_data_dir), &profile_id).await
}

#[tauri::command]
#[specta::specta]
pub async fn synthesize_tts<R: tauri::Runtime>(
    app: AppHandle<R>,
    input: TtsSynthesisInput,
) -> Result<TtsAudioArtifactDto, AppError> {
    let app_data_dir = common::app_data_dir(&app)?;
    let cache_directory = app.path().app_cache_dir()?.join("tts");
    let artifact = DesktopTtsService::synthesize(
        &crate::config::config_path(&app_data_dir),
        &cache_directory,
        input,
    )
    .await?;
    app.asset_protocol_scope().allow_file(&artifact.path)?;
    Ok(artifact)
}

#[tauri::command]
#[specta::specta]
pub async fn synthesize_tts_request<R: tauri::Runtime>(
    app: AppHandle<R>,
    coordinator: State<'_, TtsSynthesisCoordinator>,
    request_id: String,
    input: TtsSynthesisInput,
) -> Result<TtsAudioArtifactDto, AppError> {
    let request_id = request_id.trim().to_owned();
    if request_id.is_empty() {
        return Err(AppError::Tts("TTS_REQUEST_ID_REQUIRED".into()));
    }
    let app_data_dir = common::app_data_dir(&app)?;
    let config_path = crate::config::config_path(&app_data_dir);
    let cache_directory = app.path().app_cache_dir()?.join("tts");
    let Some(mut cancelled) = coordinator.start(&request_id) else {
        return Err(AppError::Tts("TTS_SYNTHESIS_CANCELLED".into()));
    };
    let result = tokio::select! {
        result = DesktopTtsService::synthesize(
            &config_path,
            &cache_directory,
            input,
        ) => result,
        _ = &mut cancelled => Err(AppError::Tts("TTS_SYNTHESIS_CANCELLED".into())),
    };
    coordinator.finish(&request_id);
    let artifact = result?;
    app.asset_protocol_scope().allow_file(&artifact.path)?;
    Ok(artifact)
}

#[tauri::command]
#[specta::specta]
pub fn cancel_tts_synthesis(
    coordinator: State<'_, TtsSynthesisCoordinator>,
    request_id: String,
) -> bool {
    let request_id = request_id.trim();
    !request_id.is_empty() && coordinator.cancel(request_id)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn should_cancel_active_and_prestart_synthesis_requests() {
        let coordinator = TtsSynthesisCoordinator::default();
        let active = coordinator.start("active").unwrap();

        assert!(coordinator.cancel("active"));
        assert!(active.await.is_ok());

        assert!(coordinator.cancel("before-start"));
        assert!(coordinator.start("before-start").is_none());
    }
}
