use std::path::Path;

use sea_orm::DatabaseConnection;

use crate::error::AppError;
use crate::models::AppConfig;
use crate::repositories::{
    calibre_repo::CalibreBookRepository, progress_repo::SqliteProgressRepository,
};
use crate::services::library_service::LibraryService;
use crate::sync::{
    automerge_document::{
        add_reading_completion, add_reading_session_duration, reading_completion_records,
        ReadingCompletionValue, ReadingSessionValue,
    },
    automerge_store::commit_library_sidecar_automerge_mutation,
    replica_identity::{ensure_replica_identity, ReplicaIdentity},
};
use crate::utils::paths::{library_root_path, library_sidecar_path};

pub struct ReadingStatisticsService;

fn timestamp(value: f64, name: &str) -> Result<i64, AppError> {
    if !value.is_finite() || value < 0.0 || value.fract() != 0.0 || value > i64::MAX as f64 {
        return Err(AppError::Config(format!("INVALID_{name}")));
    }
    Ok(value as i64)
}

fn format_name(value: &str) -> Result<String, AppError> {
    let value = value.trim().to_uppercase();
    if !matches!(value.as_str(), "EPUB" | "PDF" | "CBZ") {
        return Err(AppError::Config("INVALID_READING_STATISTICS_FORMAT".into()));
    }
    Ok(value)
}

fn validate_local_day(value: &str) -> Result<(), AppError> {
    let bytes = value.as_bytes();
    if bytes.len() != 10
        || bytes[4] != b'-'
        || bytes[7] != b'-'
        || bytes
            .iter()
            .enumerate()
            .any(|(index, byte)| index != 4 && index != 7 && !byte.is_ascii_digit())
    {
        return Err(AppError::Config("INVALID_READING_LOCAL_DAY".into()));
    }
    Ok(())
}

impl ReadingStatisticsService {
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

    #[allow(clippy::too_many_arguments)]
    pub async fn add_session_interval_for_library(
        app_data_dir: &Path,
        config: &AppConfig,
        library_id: Option<&str>,
        id: &str,
        book_id: i64,
        format: &str,
        local_day: &str,
        started_at: f64,
        duration_seconds: i64,
        updated_at: f64,
    ) -> Result<(), AppError> {
        if duration_seconds < 0 {
            return Err(AppError::Config("INVALID_READING_SESSION_DURATION".into()));
        }
        validate_local_day(local_day)?;
        let format = format_name(format)?;
        let started_at = timestamp(started_at, "READING_SESSION_STARTED_AT")?;
        let updated_at = timestamp(updated_at, "READING_SESSION_UPDATED_AT")?;
        let (db, identity) = Self::automerge_context(app_data_dir, config, library_id).await?;
        let interval = ReadingSessionValue {
            id: id.to_owned(),
            origin_replica_id: identity.replica_id.clone(),
            book_id,
            format,
            local_day: local_day.to_owned(),
            started_at,
            duration_seconds,
            updated_at,
        };
        commit_library_sidecar_automerge_mutation(&db, &identity, updated_at as u64, |document| {
            add_reading_session_duration(document, &interval)?;
            Ok(())
        })
        .await
    }

    #[allow(clippy::too_many_arguments)]
    pub async fn add_completion_for_library(
        app_data_dir: &Path,
        config: &AppConfig,
        library_id: Option<&str>,
        id: &str,
        book_id: i64,
        format: &str,
        local_day: &str,
        completed_at: f64,
        updated_at: f64,
    ) -> Result<bool, AppError> {
        validate_local_day(local_day)?;
        let format = format_name(format)?;
        let completed_at = timestamp(completed_at, "READING_COMPLETION_AT")?;
        let updated_at = timestamp(updated_at, "READING_COMPLETION_UPDATED_AT")?;
        let (db, identity) = Self::automerge_context(app_data_dir, config, library_id).await?;
        let completion = ReadingCompletionValue {
            id: id.to_owned(),
            book_id,
            format,
            local_day: local_day.to_owned(),
            completed_at,
            updated_at,
            replica_id: identity.replica_id.clone(),
        };
        let mut changed = false;
        commit_library_sidecar_automerge_mutation(&db, &identity, updated_at as u64, |document| {
            let existing = reading_completion_records(document)?
                .into_iter()
                .find(|value| value.book_id == completion.book_id);
            if existing.is_some_and(|value| {
                value.completed_at < completion.completed_at
                    || (value.completed_at == completion.completed_at && value.id <= completion.id)
            }) {
                return Ok(());
            }
            changed = add_reading_completion(document, &completion)?.is_some();
            Ok(())
        })
        .await?;
        Ok(changed)
    }
}
