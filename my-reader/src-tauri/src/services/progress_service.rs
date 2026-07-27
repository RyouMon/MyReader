use std::path::Path;

use sea_orm::DatabaseConnection;

use crate::error::AppError;
use crate::models::{AppConfig, ReadingProgressDto};
use crate::repositories::{
    calibre_repo::CalibreBookRepository, progress_repo::SqliteProgressRepository,
};
use crate::services::library_service::LibraryService;
use crate::sync::{
    automerge_document::{
        reading_position_candidates, resolve_reading_position, set_reading_position,
        ReadingPositionValue,
    },
    automerge_store::{
        commit_library_sidecar_automerge_mutation, read_library_sidecar_automerge_document,
    },
    reader_locator::ReaderLocator,
    replica_identity::{ensure_replica_identity, ReplicaIdentity},
};
use crate::utils::paths::{library_root_path, library_sidecar_path};

pub struct ProgressService;

#[derive(Debug, Clone, serde::Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct ReadingPositionCandidateDto {
    pub operation_id: String,
    #[specta(type = specta_typescript::Any)]
    pub locator: serde_json::Value,
    pub display_progression: Option<f64>,
    pub recorded_at: i64,
    pub replica_id: String,
}

fn unix_epoch_millis() -> f64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as f64)
        .unwrap_or(0.0)
}

impl ProgressService {
    async fn automerge_context(
        app_data_dir: &Path,
        config: &AppConfig,
        library_id: Option<&str>,
    ) -> Result<(DatabaseConnection, ReplicaIdentity), AppError> {
        let library = LibraryService::resolve_library(library_id, config)?;
        let sidecar_root = library_sidecar_path(&library, app_data_dir)
            .to_string_lossy()
            .to_string();
        let db = SqliteProgressRepository::open(&sidecar_root).await?;
        let library_root = library_root_path(&library, app_data_dir)
            .to_string_lossy()
            .to_string();
        let library_uuid = CalibreBookRepository::open(&library_root)
            .await?
            .get_library_uuid()
            .await?;
        let identity = ensure_replica_identity(&db, &library_uuid).await?;
        Ok((db, identity))
    }

    pub async fn get_reading_progress(
        sidecar_root: &str,
        lib_id: &str,
        book_id: i64,
        format: &str,
    ) -> Result<Option<ReadingProgressDto>, AppError> {
        let db = SqliteProgressRepository::open(sidecar_root).await?;
        SqliteProgressRepository::get_progress(&db, lib_id, book_id, format).await
    }

    async fn set_reading_progress_in_db(
        db: &sea_orm::DatabaseConnection,
        identity: &ReplicaIdentity,
        book_id: i64,
        format: &str,
        locator: &serde_json::Value,
        display_progression: Option<f64>,
    ) -> Result<(), AppError> {
        let locator: ReaderLocator = serde_json::from_value(locator.clone())
            .map_err(|error| AppError::Serialize(error.to_string()))?;
        let format = format.trim().to_uppercase();
        if !matches!(format.as_str(), "EPUB" | "PDF" | "CBZ") {
            return Err(AppError::Sync(
                "Reading position format is unsupported".into(),
            ));
        }
        let display_progression_ppm = display_progression
            .map(|value| {
                if !(0.0..=1.0).contains(&value) {
                    return Err(AppError::Sync(
                        "Reading position display progression is out of range".into(),
                    ));
                }
                Ok((value * 1_000_000.0).round() as u32)
            })
            .transpose()?;
        let now_ms = unix_epoch_millis() as u64;
        let value = ReadingPositionValue {
            format,
            locator_json: serde_json::to_string(&locator)
                .map_err(|error| AppError::Serialize(error.to_string()))?,
            display_progression_ppm,
            recorded_at: now_ms as i64,
            replica_id: identity.replica_id.clone(),
        };
        commit_library_sidecar_automerge_mutation(db, identity, now_ms, |document| {
            set_reading_position(document, book_id, &value)?;
            Ok(())
        })
        .await
    }

    pub async fn set_reading_progress(
        sidecar_root: &str,
        library_uuid: &str,
        book_id: i64,
        format: &str,
        locator: &serde_json::Value,
        display_progression: Option<f64>,
    ) -> Result<(), AppError> {
        let db = SqliteProgressRepository::open(sidecar_root).await?;
        let identity = ensure_replica_identity(&db, library_uuid).await?;
        Self::set_reading_progress_in_db(
            &db,
            &identity,
            book_id,
            format,
            locator,
            display_progression,
        )
        .await
    }

    pub async fn list_reading_progress(
        sidecar_root: &str,
        lib_id: &str,
    ) -> Result<Vec<ReadingProgressDto>, AppError> {
        let db = SqliteProgressRepository::open(sidecar_root).await?;
        SqliteProgressRepository::list_all_progress(&db, lib_id).await
    }

    pub async fn get_reading_progress_for_library(
        app_data_dir: &Path,
        config: &AppConfig,
        library_id: Option<&str>,
        book_id: i64,
        format: &str,
    ) -> Result<Option<ReadingProgressDto>, AppError> {
        let lib = LibraryService::resolve_library(library_id, config)?;
        let sidecar_root = library_sidecar_path(&lib, app_data_dir)
            .to_string_lossy()
            .to_string();
        let lib_id = lib.id.clone();
        Self::get_reading_progress(&sidecar_root, &lib_id, book_id, format).await
    }

    pub async fn list_reading_progress_for_library(
        app_data_dir: &Path,
        config: &AppConfig,
        library_id: Option<&str>,
    ) -> Result<Vec<ReadingProgressDto>, AppError> {
        let lib = LibraryService::resolve_library(library_id, config)?;
        let sidecar_root = library_sidecar_path(&lib, app_data_dir)
            .to_string_lossy()
            .to_string();
        let lib_id = lib.id.clone();
        Self::list_reading_progress(&sidecar_root, &lib_id).await
    }

    pub async fn set_reading_progress_for_library(
        app_data_dir: &Path,
        config: &AppConfig,
        library_id: Option<&str>,
        book_id: i64,
        format: &str,
        locator: &serde_json::Value,
        display_progression: Option<f64>,
    ) -> Result<(), AppError> {
        let lib = LibraryService::resolve_library(library_id, config)?;
        let sidecar_root = library_sidecar_path(&lib, app_data_dir)
            .to_string_lossy()
            .to_string();
        let db = SqliteProgressRepository::open(&sidecar_root).await?;
        let library_root = library_root_path(&lib, app_data_dir)
            .to_string_lossy()
            .to_string();
        let library_uuid = CalibreBookRepository::open(&library_root)
            .await?
            .get_library_uuid()
            .await?;
        let identity = ensure_replica_identity(&db, &library_uuid).await?;
        Self::set_reading_progress_in_db(
            &db,
            &identity,
            book_id,
            format,
            locator,
            display_progression,
        )
        .await
    }

    pub async fn list_reading_position_candidates_for_library(
        app_data_dir: &Path,
        config: &AppConfig,
        library_id: Option<&str>,
        book_id: i64,
        format: &str,
    ) -> Result<Vec<ReadingPositionCandidateDto>, AppError> {
        let (db, identity) = Self::automerge_context(app_data_dir, config, library_id).await?;
        let document =
            read_library_sidecar_automerge_document(&db, &identity, unix_epoch_millis() as u64)
                .await?;
        reading_position_candidates(&document, book_id, &format.trim().to_uppercase())?
            .into_iter()
            .map(|candidate| {
                Ok(ReadingPositionCandidateDto {
                    operation_id: candidate.operation_id,
                    locator: serde_json::from_str(&candidate.value.locator_json)
                        .map_err(|error| AppError::Serialize(error.to_string()))?,
                    display_progression: candidate
                        .value
                        .display_progression_ppm
                        .map(|value| f64::from(value) / 1_000_000.0),
                    recorded_at: candidate.value.recorded_at,
                    replica_id: candidate.value.replica_id,
                })
            })
            .collect()
    }

    pub async fn select_reading_position_candidate_for_library(
        app_data_dir: &Path,
        config: &AppConfig,
        library_id: Option<&str>,
        book_id: i64,
        format: &str,
        operation_id: &str,
    ) -> Result<(), AppError> {
        let (db, identity) = Self::automerge_context(app_data_dir, config, library_id).await?;
        let now_ms = unix_epoch_millis() as u64;
        commit_library_sidecar_automerge_mutation(&db, &identity, now_ms, |document| {
            resolve_reading_position(
                document,
                book_id,
                &format.trim().to_uppercase(),
                operation_id,
                now_ms as i64,
            )?;
            Ok(())
        })
        .await
    }
}
