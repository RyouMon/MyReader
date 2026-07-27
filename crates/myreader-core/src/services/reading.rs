use std::path::Path;

use myreader_sync::{
    document::{
        favorite_projections, resolve_reading_position, set_favorite,
        set_reading_position as write_reading_position, FavoriteValue, ReadingPositionValue,
    },
    persistence::{
        ensure_database_document, ensure_database_identity, execute_local_database_mutation,
        DatabaseIdentity,
    },
};
use tracing::info;

use crate::database;
use crate::models::{ReadingPosition, ReadingPositionCandidate};
use crate::repositories::calibre::CalibreBookRepository;
use crate::repositories::reading::ReadingRepository;
use crate::CoreError;

pub(crate) async fn list_favorite_book_ids(sidecar_root: &Path) -> Result<Vec<i64>, CoreError> {
    let db = database::open_db(&sidecar_root.to_string_lossy()).await?;
    ReadingRepository::new(&db).list_favorite_book_ids().await
}

pub(crate) async fn set_favorite_book(
    sidecar_root: &Path,
    library_root: &Path,
    book_id: i64,
    is_favorite: bool,
    recorded_at_ms: i64,
) -> Result<(), CoreError> {
    if book_id < 1 {
        return Err(CoreError::Config("Favorite book ID is invalid".into()));
    }
    if recorded_at_ms < 0 {
        return Err(CoreError::Config(
            "Favorite recorded time is invalid".into(),
        ));
    }

    database::open_db(&sidecar_root.to_string_lossy()).await?;
    let library_uuid = CalibreBookRepository::open(&library_root.to_string_lossy())
        .await?
        .get_library_uuid()
        .await?;
    let database_path = database::library_db_path(&sidecar_root.to_string_lossy())?;
    let database_path = database_path
        .to_str()
        .ok_or_else(|| CoreError::Config("Library database path is invalid UTF-8".into()))?;
    let identity = ensure_database_identity(database_path, &library_uuid)?;
    let replica_id = identity.replica_id.clone();
    let mut changed = false;

    execute_local_database_mutation(database_path, &identity, recorded_at_ms, |document| {
        let current = favorite_projections(document)?
            .into_iter()
            .find(|(id, _)| *id == book_id)
            .map(|(_, value)| value);
        if current.as_ref().map(|value| value.is_favorite) == Some(is_favorite)
            || (current.is_none() && !is_favorite)
        {
            return Ok(());
        }
        changed = true;
        set_favorite(
            document,
            book_id,
            &FavoriteValue {
                is_favorite,
                added_at: if is_favorite {
                    Some(recorded_at_ms)
                } else {
                    current.and_then(|value| value.added_at)
                },
                recorded_at: recorded_at_ms,
                replica_id: replica_id.clone(),
            },
        )?;
        Ok(())
    })?;

    if changed {
        info!(
            target: "myreader_sync",
            event = "book_favorite.local_write",
            library_uuid,
            replica_id,
            book_id,
            is_favorite,
            "Committed local favorite state"
        );
    }
    Ok(())
}

pub(crate) async fn get_reading_position(
    sidecar_root: &Path,
    book_id: i64,
    format: &str,
) -> Result<Option<ReadingPosition>, CoreError> {
    let format = normalize_reading_format(format)?;
    let db = database::open_db(&sidecar_root.to_string_lossy()).await?;
    ReadingRepository::new(&db)
        .get_reading_position(book_id, &format)
        .await
}

pub(crate) async fn list_reading_positions(
    sidecar_root: &Path,
) -> Result<Vec<ReadingPosition>, CoreError> {
    let db = database::open_db(&sidecar_root.to_string_lossy()).await?;
    ReadingRepository::new(&db).list_reading_positions().await
}

pub(crate) async fn latest_read_at_by_book(
    sidecar_root: &Path,
) -> Result<std::collections::BTreeMap<i64, f64>, CoreError> {
    let db = database::open_db(&sidecar_root.to_string_lossy()).await?;
    ReadingRepository::new(&db).latest_read_at_by_book().await
}

pub(crate) async fn set_reading_position(
    sidecar_root: &Path,
    library_root: &Path,
    book_id: i64,
    format: &str,
    locator_json: &str,
    display_progression: Option<f64>,
    recorded_at_ms: i64,
) -> Result<(), CoreError> {
    if book_id < 1 || recorded_at_ms < 0 {
        return Err(CoreError::Config("Reading position is invalid".into()));
    }
    let format = normalize_reading_format(format)?;
    let locator_json = validate_locator_json(locator_json)?;
    let display_progression_ppm = display_progression
        .map(|value| {
            if !value.is_finite() || !(0.0..=1.0).contains(&value) {
                return Err(CoreError::Config(
                    "Reading position display progression is out of range".into(),
                ));
            }
            Ok((value * 1_000_000.0).round() as u32)
        })
        .transpose()?;
    let (database_path, identity) = sync_context(sidecar_root, library_root).await?;
    let value = ReadingPositionValue {
        format: format.clone(),
        locator_json,
        display_progression_ppm,
        recorded_at: recorded_at_ms,
        replica_id: identity.replica_id.clone(),
    };

    execute_local_database_mutation(&database_path, &identity, recorded_at_ms, |document| {
        write_reading_position(document, book_id, &value)?;
        Ok(())
    })?;
    info!(
        target: "myreader_sync",
        event = "reading_position.local_write",
        library_uuid = identity.library_uuid,
        replica_id = identity.replica_id,
        book_id,
        format,
        "Committed local reading position"
    );
    Ok(())
}

pub(crate) async fn list_reading_position_candidates(
    sidecar_root: &Path,
    library_root: &Path,
    book_id: i64,
    format: &str,
    now_ms: i64,
) -> Result<Vec<ReadingPositionCandidate>, CoreError> {
    if book_id < 1 || now_ms < 0 {
        return Err(CoreError::Config("Reading position is invalid".into()));
    }
    let format = normalize_reading_format(format)?;
    let (database_path, identity) = sync_context(sidecar_root, library_root).await?;
    let result = ensure_database_document(&database_path, &identity, now_ms)?;
    result
        .projection
        .reading_position_candidates
        .into_iter()
        .filter(|candidate| candidate.book_id == book_id && candidate.format == format)
        .map(|candidate| {
            Ok(ReadingPositionCandidate {
                operation_id: candidate.operation_id,
                locator: serde_json::from_str(&candidate.value.locator_json)?,
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

pub(crate) async fn select_reading_position_candidate(
    sidecar_root: &Path,
    library_root: &Path,
    book_id: i64,
    format: &str,
    operation_id: &str,
    recorded_at_ms: i64,
) -> Result<(), CoreError> {
    if book_id < 1 || operation_id.is_empty() || recorded_at_ms < 0 {
        return Err(CoreError::Config(
            "Reading position candidate is invalid".into(),
        ));
    }
    let format = normalize_reading_format(format)?;
    let (database_path, identity) = sync_context(sidecar_root, library_root).await?;
    execute_local_database_mutation(&database_path, &identity, recorded_at_ms, |document| {
        resolve_reading_position(document, book_id, &format, operation_id, recorded_at_ms)?;
        Ok(())
    })?;
    Ok(())
}

async fn sync_context(
    sidecar_root: &Path,
    library_root: &Path,
) -> Result<(String, DatabaseIdentity), CoreError> {
    database::open_db(&sidecar_root.to_string_lossy()).await?;
    let library_uuid = CalibreBookRepository::open(&library_root.to_string_lossy())
        .await?
        .get_library_uuid()
        .await?;
    let database_path = database::library_db_path(&sidecar_root.to_string_lossy())?;
    let database_path = database_path
        .to_str()
        .ok_or_else(|| CoreError::Config("Library database path is invalid UTF-8".into()))?
        .to_owned();
    let identity = ensure_database_identity(&database_path, &library_uuid)?;
    Ok((database_path, identity))
}

fn normalize_reading_format(format: &str) -> Result<String, CoreError> {
    let format = format.trim().to_uppercase();
    if matches!(format.as_str(), "EPUB" | "PDF" | "CBZ") {
        Ok(format)
    } else {
        Err(CoreError::Config(
            "Reading position format is unsupported".into(),
        ))
    }
}

fn validate_locator_json(locator_json: &str) -> Result<String, CoreError> {
    let locator: serde_json::Value = serde_json::from_str(locator_json)?;
    let Some(object) = locator.as_object() else {
        return Err(CoreError::Config("Reading locator is invalid".into()));
    };
    for key in ["href", "type"] {
        if !object
            .get(key)
            .and_then(serde_json::Value::as_str)
            .is_some_and(|value| !value.trim().is_empty())
        {
            return Err(CoreError::Config("Reading locator is invalid".into()));
        }
    }
    serde_json::to_string(&locator).map_err(Into::into)
}

#[cfg(test)]
mod tests {
    use sea_orm::{ActiveModelTrait, ConnectionTrait, Database, Schema, Set};

    use crate::entities::app::sync_automerge_outbox;
    use crate::entities::calibre::library_id;

    async fn seed_library_uuid(root: &Path) {
        let db = Database::connect(format!(
            "sqlite://{}?mode=rwc",
            root.join("metadata.db").display()
        ))
        .await
        .unwrap();
        let schema = Schema::new(db.get_database_backend());
        db.execute(&schema.create_table_from_entity(library_id::Entity))
            .await
            .unwrap();
        library_id::ActiveModel {
            id: Set(1),
            uuid: Set("11111111-2222-4333-8444-555555555555".into()),
        }
        .insert(&db)
        .await
        .unwrap();
    }

    use std::path::Path;

    use sea_orm::EntityTrait;

    #[tokio::test]
    async fn should_persist_projection_and_outbox_when_book_is_favorited() {
        let sidecar = tempfile::tempdir().unwrap();
        let library = tempfile::tempdir().unwrap();
        seed_library_uuid(library.path()).await;

        super::set_favorite_book(sidecar.path(), library.path(), 42, true, 900)
            .await
            .unwrap();

        assert_eq!(
            super::list_favorite_book_ids(sidecar.path()).await.unwrap(),
            vec![42]
        );
        let db = crate::database::open_db(&sidecar.path().to_string_lossy())
            .await
            .unwrap();
        assert_eq!(
            sync_automerge_outbox::Entity::find()
                .all(&db)
                .await
                .unwrap()
                .len(),
            2
        );
    }

    #[tokio::test]
    async fn should_not_create_change_when_favorite_state_is_unchanged() {
        let sidecar = tempfile::tempdir().unwrap();
        let library = tempfile::tempdir().unwrap();
        seed_library_uuid(library.path()).await;

        super::set_favorite_book(sidecar.path(), library.path(), 42, true, 900)
            .await
            .unwrap();
        super::set_favorite_book(sidecar.path(), library.path(), 42, true, 901)
            .await
            .unwrap();

        let db = crate::database::open_db(&sidecar.path().to_string_lossy())
            .await
            .unwrap();
        assert_eq!(
            sync_automerge_outbox::Entity::find()
                .all(&db)
                .await
                .unwrap()
                .len(),
            2
        );
    }

    #[tokio::test]
    async fn should_round_trip_position_when_reader_saves_valid_locator() {
        let sidecar = tempfile::tempdir().unwrap();
        let library = tempfile::tempdir().unwrap();
        seed_library_uuid(library.path()).await;

        super::set_reading_position(
            sidecar.path(),
            library.path(),
            42,
            "epub",
            r#"{"href":"chapter.xhtml","type":"application/xhtml+xml","locations":{"position":3}}"#,
            Some(0.4),
            900,
        )
        .await
        .unwrap();

        let position = super::get_reading_position(sidecar.path(), 42, "EPUB")
            .await
            .unwrap()
            .unwrap();
        assert_eq!(position.locator["href"], "chapter.xhtml");
        assert_eq!(position.display_progression, Some(0.4));
        assert_eq!(position.updated_at, 900.0);

        let candidates = super::list_reading_position_candidates(
            sidecar.path(),
            library.path(),
            42,
            "EPUB",
            901,
        )
        .await
        .unwrap();
        assert_eq!(candidates.len(), 1);
        assert_eq!(candidates[0].locator["locations"]["position"], 3);
    }

    #[tokio::test]
    async fn should_reject_position_when_locator_is_missing_required_fields() {
        let sidecar = tempfile::tempdir().unwrap();
        let library = tempfile::tempdir().unwrap();
        seed_library_uuid(library.path()).await;

        let error = super::set_reading_position(
            sidecar.path(),
            library.path(),
            42,
            "EPUB",
            r#"{"href":"chapter.xhtml"}"#,
            None,
            900,
        )
        .await
        .unwrap_err();

        assert!(error.to_string().contains("Reading locator is invalid"));
    }
}
