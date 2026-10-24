use crate::{
    commands::{common, AppState},
    error::AppError,
    services::{
        library_service::LibraryService, llm_service::selected_credential, narration_dto::*,
        tts_service::TtsVoiceRefDto,
    },
    utils::paths::library_sidecar_path,
};
use my_reader_core::api::narration::NarrationService;
use tauri::{AppHandle, State};

fn paths<R: tauri::Runtime>(
    app: &AppHandle<R>,
    state: &State<'_, AppState>,
    library_id: &str,
) -> Result<(std::path::PathBuf, std::path::PathBuf), AppError> {
    let app_data = common::app_data_dir(app)?;
    let library =
        LibraryService::resolve_library(Some(library_id), &common::config_snapshot(state))?;
    Ok((
        library_sidecar_path(&library, &app_data),
        crate::config::config_path(&app_data),
    ))
}

#[tauri::command]
#[specta::specta]
pub async fn get_book_narration<R: tauri::Runtime>(
    app: AppHandle<R>,
    state: State<'_, AppState>,
    library_id: String,
    book_id: i64,
) -> Result<BookNarrationSettingsDto, AppError> {
    let (root, _) = paths(&app, &state, &library_id)?;
    Ok(NarrationService::get_settings(&root, book_id).await?.into())
}
#[tauri::command]
#[specta::specta]
pub async fn save_book_narration<R: tauri::Runtime>(
    app: AppHandle<R>,
    state: State<'_, AppState>,
    library_id: String,
    settings: BookNarrationSettingsDto,
) -> Result<BookNarrationSettingsDto, AppError> {
    let (root, _) = paths(&app, &state, &library_id)?;
    Ok(NarrationService::save_settings(&root, settings.into())
        .await?
        .into())
}
#[tauri::command]
#[specta::specta]
pub async fn cancel_book_narration<R: tauri::Runtime>(
    app: AppHandle<R>,
    state: State<'_, AppState>,
    library_id: String,
    book_id: i64,
) -> Result<(), AppError> {
    let (root, _) = paths(&app, &state, &library_id)?;
    Ok(NarrationService::cancel(&root, book_id).await?)
}
#[tauri::command]
#[specta::specta]
pub async fn import_book_characters<R: tauri::Runtime>(
    app: AppHandle<R>,
    state: State<'_, AppState>,
    library_id: String,
    request: CharacterImportRequestDto,
) -> Result<Vec<CharacterImportCandidateDto>, AppError> {
    let (root, config) = paths(&app, &state, &library_id)?;
    let credential = selected_credential(&config)?;
    Ok(
        NarrationService::import_characters(&root, &config, request.into(), Some(&credential))
            .await?
            .into_iter()
            .map(Into::into)
            .collect(),
    )
}
#[tauri::command]
#[specta::specta]
pub async fn prepare_book_narration<R: tauri::Runtime>(
    app: AppHandle<R>,
    state: State<'_, AppState>,
    coordinator: State<'_, crate::commands::tts::TtsSynthesisCoordinator>,
    library_id: String,
    request_id: String,
    request: NarrationRequestDto,
    default_voice: TtsVoiceRefDto,
) -> Result<Vec<NarrationSpeechDto>, AppError> {
    let Some(mut cancelled) = coordinator.start(&request_id) else {
        return Err(AppError::Config("NARRATION_CANCELLED".into()));
    };
    let work = async {
        let (root, config) = paths(&app, &state, &library_id)?;
        let enabled = NarrationService::get_settings(&root, request.book_id)
            .await?
            .enabled;
        let credential = if enabled {
            Some(selected_credential(&config)?)
        } else {
            None
        };
        Ok(NarrationService::prepare(
            &root,
            &config,
            request.into(),
            default_voice.into(),
            credential.as_ref(),
        )
        .await?
        .into_iter()
        .map(Into::into)
        .collect())
    };
    let result = tokio::select! {
        biased;
        _ = &mut cancelled => Err(AppError::Config("NARRATION_CANCELLED".into())),
        result = work => result,
    };
    coordinator.finish(&request_id);
    result
}
