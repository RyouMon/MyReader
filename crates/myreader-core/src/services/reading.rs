use std::path::Path;

use myreader_sync::{
    document::{
        annotation_projections, bookmark_projections, create_annotation, delete_annotation,
        favorite_projections, resolve_reading_position, set_bookmark, set_favorite,
        set_reading_position as write_reading_position, update_annotation, AnnotationValue,
        BookmarkValue, FavoriteValue, ReadingPositionValue,
    },
    persistence::{
        ensure_database_document, ensure_database_identity, execute_local_database_mutation,
        DatabaseIdentity,
    },
};
use tracing::info;

use crate::database;
use crate::models::{ReaderAnnotation, ReaderBookmark, ReadingPosition, ReadingPositionCandidate};
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

pub(crate) async fn list_reader_bookmarks(
    sidecar_root: &Path,
    book_id: i64,
    format: &str,
) -> Result<Vec<ReaderBookmark>, CoreError> {
    if book_id < 1 {
        return Err(CoreError::Config("Bookmark identity is invalid".into()));
    }
    let format = normalize_reading_format(format)?;
    let db = database::open_db(&sidecar_root.to_string_lossy()).await?;
    ReadingRepository::new(&db)
        .list_bookmarks(book_id, &format)
        .await
}

pub(crate) async fn add_reader_bookmark(
    sidecar_root: &Path,
    library_root: &Path,
    book_id: i64,
    format: &str,
    locator_key: &str,
    locator_json: &str,
    recorded_at_ms: i64,
) -> Result<ReaderBookmark, CoreError> {
    let (format, locator_key, locator_json) = validate_bookmark(
        book_id,
        format,
        locator_key,
        Some(locator_json),
        recorded_at_ms,
    )?;
    let (database_path, identity) = sync_context(sidecar_root, library_root).await?;

    execute_local_database_mutation(&database_path, &identity, recorded_at_ms, |document| {
        let current = bookmark_projections(document)?.into_iter().find(|item| {
            item.book_id == book_id && item.format == format && item.locator_key == locator_key
        });
        if current
            .as_ref()
            .is_some_and(|bookmark| bookmark.deleted_at.is_none())
        {
            return Ok(());
        }
        set_bookmark(
            document,
            &BookmarkValue {
                id: current.as_ref().map_or_else(
                    || uuid::Uuid::new_v4().as_simple().to_string(),
                    |bookmark| bookmark.id.clone(),
                ),
                book_id,
                format: format.clone(),
                locator_key: locator_key.clone(),
                locator_json: locator_json.clone(),
                created_at: current
                    .as_ref()
                    .map_or(recorded_at_ms, |bookmark| bookmark.created_at),
                deleted_at: None,
                recorded_at: recorded_at_ms,
                replica_id: identity.replica_id.clone(),
            },
        )?;
        Ok(())
    })?;

    info!(
        target: "myreader_sync",
        event = "bookmark.local_write",
        library_uuid = identity.library_uuid,
        replica_id = identity.replica_id,
        book_id,
        format,
        locator_key,
        present = true,
        "Committed local bookmark state"
    );
    let db = database::open_db(&sidecar_root.to_string_lossy()).await?;
    ReadingRepository::new(&db)
        .find_bookmark(book_id, &format, &locator_key)
        .await?
        .ok_or_else(|| CoreError::Database("Bookmark add returned no row".into()))
}

pub(crate) async fn remove_reader_bookmark(
    sidecar_root: &Path,
    library_root: &Path,
    book_id: i64,
    format: &str,
    locator_key: &str,
    recorded_at_ms: i64,
) -> Result<(), CoreError> {
    let (format, locator_key, _) =
        validate_bookmark(book_id, format, locator_key, None, recorded_at_ms)?;
    let (database_path, identity) = sync_context(sidecar_root, library_root).await?;
    let mut changed = false;

    execute_local_database_mutation(&database_path, &identity, recorded_at_ms, |document| {
        let current = bookmark_projections(document)?.into_iter().find(|item| {
            item.book_id == book_id && item.format == format && item.locator_key == locator_key
        });
        let Some(current) = current.filter(|bookmark| bookmark.deleted_at.is_none()) else {
            return Ok(());
        };
        changed = true;
        set_bookmark(
            document,
            &BookmarkValue {
                deleted_at: Some(recorded_at_ms),
                recorded_at: recorded_at_ms,
                replica_id: identity.replica_id.clone(),
                ..current
            },
        )?;
        Ok(())
    })?;

    if changed {
        info!(
            target: "myreader_sync",
            event = "bookmark.local_write",
            library_uuid = identity.library_uuid,
            replica_id = identity.replica_id,
            book_id,
            format,
            locator_key,
            present = false,
            "Committed local bookmark state"
        );
    }
    Ok(())
}

pub(crate) async fn list_reader_annotations(
    sidecar_root: &Path,
    book_id: i64,
    format: &str,
) -> Result<Vec<ReaderAnnotation>, CoreError> {
    if book_id < 1 {
        return Err(CoreError::Config("Annotation identity is invalid".into()));
    }
    let format = normalize_reading_format(format)?;
    let db = database::open_db(&sidecar_root.to_string_lossy()).await?;
    ReadingRepository::new(&db)
        .list_annotations(book_id, &format)
        .await
}

#[allow(clippy::too_many_arguments)]
pub(crate) async fn add_reader_annotation(
    sidecar_root: &Path,
    library_root: &Path,
    book_id: i64,
    format: &str,
    locator_json: &str,
    color: &str,
    note: Option<&str>,
    recorded_at_ms: i64,
) -> Result<ReaderAnnotation, CoreError> {
    let format = validate_annotation_identity(book_id, format, recorded_at_ms)?;
    let locator_json = validate_annotation_locator(locator_json)?;
    let color = validate_annotation_color(color)?.to_owned();
    let note = normalize_annotation_note(note)?;
    let id = uuid::Uuid::new_v4().as_simple().to_string();
    let (database_path, identity) = sync_context(sidecar_root, library_root).await?;

    execute_local_database_mutation(&database_path, &identity, recorded_at_ms, |document| {
        create_annotation(
            document,
            &AnnotationValue {
                id: id.clone(),
                book_id,
                format,
                kind: "highlight".into(),
                locator_json,
                created_at: recorded_at_ms,
                color,
                note,
                updated_at: recorded_at_ms,
                deleted: false,
                deleted_at: None,
            },
        )?;
        Ok(())
    })?;
    info!(
        target: "myreader_sync",
        event = "annotation.local_write",
        library_uuid = identity.library_uuid,
        replica_id = identity.replica_id,
        annotation_id = id,
        book_id,
        operation = "create",
        "Committed local annotation state"
    );
    find_annotation(sidecar_root, &id).await
}

#[allow(clippy::too_many_arguments)]
pub(crate) async fn update_reader_annotation(
    sidecar_root: &Path,
    library_root: &Path,
    book_id: i64,
    format: &str,
    id: &str,
    color: &str,
    note: Option<&str>,
    recorded_at_ms: i64,
) -> Result<ReaderAnnotation, CoreError> {
    let format = validate_annotation_identity(book_id, format, recorded_at_ms)?;
    let color = validate_annotation_color(color)?.to_owned();
    let note = normalize_annotation_note(note)?;
    let (database_path, identity) = sync_context(sidecar_root, library_root).await?;
    let mut exists = false;

    execute_local_database_mutation(&database_path, &identity, recorded_at_ms, |document| {
        exists = annotation_projections(document)?
            .into_iter()
            .any(|annotation| {
                annotation.id == id
                    && annotation.book_id == book_id
                    && annotation.format == format
                    && !annotation.deleted
            });
        if exists {
            update_annotation(document, id, &color, note.as_deref(), recorded_at_ms)?;
        }
        Ok(())
    })?;
    if !exists {
        return Err(CoreError::NotFound("ANNOTATION_NOT_FOUND".into()));
    }
    info!(
        target: "myreader_sync",
        event = "annotation.local_write",
        library_uuid = identity.library_uuid,
        replica_id = identity.replica_id,
        annotation_id = id,
        book_id,
        operation = "update",
        "Committed local annotation state"
    );
    find_annotation(sidecar_root, id).await
}

pub(crate) async fn remove_reader_annotation(
    sidecar_root: &Path,
    library_root: &Path,
    book_id: i64,
    format: &str,
    id: &str,
    recorded_at_ms: i64,
) -> Result<(), CoreError> {
    let format = validate_annotation_identity(book_id, format, recorded_at_ms)?;
    let (database_path, identity) = sync_context(sidecar_root, library_root).await?;
    let mut exists = false;

    execute_local_database_mutation(&database_path, &identity, recorded_at_ms, |document| {
        exists = annotation_projections(document)?
            .into_iter()
            .any(|annotation| {
                annotation.id == id
                    && annotation.book_id == book_id
                    && annotation.format == format
                    && !annotation.deleted
            });
        if exists {
            delete_annotation(document, id, recorded_at_ms)?;
        }
        Ok(())
    })?;
    if !exists {
        return Err(CoreError::NotFound("ANNOTATION_NOT_FOUND".into()));
    }
    info!(
        target: "myreader_sync",
        event = "annotation.local_write",
        library_uuid = identity.library_uuid,
        replica_id = identity.replica_id,
        annotation_id = id,
        book_id,
        operation = "delete",
        "Committed local annotation state"
    );
    Ok(())
}

async fn find_annotation(sidecar_root: &Path, id: &str) -> Result<ReaderAnnotation, CoreError> {
    let db = database::open_db(&sidecar_root.to_string_lossy()).await?;
    ReadingRepository::new(&db)
        .find_annotation(id)
        .await?
        .ok_or_else(|| CoreError::Database("Annotation mutation returned no row".into()))
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

fn validate_bookmark(
    book_id: i64,
    format: &str,
    locator_key: &str,
    locator_json: Option<&str>,
    recorded_at_ms: i64,
) -> Result<(String, String, String), CoreError> {
    let locator_key = locator_key.trim();
    if book_id < 1 || recorded_at_ms < 0 || locator_key.is_empty() || locator_key.len() > 2048 {
        return Err(CoreError::Config("Bookmark identity is invalid".into()));
    }
    Ok((
        normalize_reading_format(format)?,
        locator_key.to_owned(),
        locator_json
            .map(validate_locator_json)
            .transpose()?
            .unwrap_or_default(),
    ))
}

fn validate_annotation_identity(
    book_id: i64,
    format: &str,
    recorded_at_ms: i64,
) -> Result<String, CoreError> {
    if book_id < 1 || recorded_at_ms < 0 {
        return Err(CoreError::Config("Annotation identity is invalid".into()));
    }
    normalize_reading_format(format)
}

fn validate_annotation_locator(locator_json: &str) -> Result<String, CoreError> {
    let locator_json = validate_locator_json(locator_json)?;
    let locator: serde_json::Value = serde_json::from_str(&locator_json)?;
    let highlight = locator
        .get("text")
        .and_then(|text| text.get("highlight"))
        .and_then(serde_json::Value::as_str)
        .map(str::trim)
        .unwrap_or_default();
    if highlight.is_empty() {
        return Err(CoreError::Config("Annotation locator is invalid".into()));
    }
    Ok(locator_json)
}

fn validate_annotation_color(color: &str) -> Result<&str, CoreError> {
    if matches!(color, "yellow" | "orange" | "green" | "blue") {
        Ok(color)
    } else {
        Err(CoreError::Config("Annotation color is invalid".into()))
    }
}

fn normalize_annotation_note(note: Option<&str>) -> Result<Option<String>, CoreError> {
    let note = note.map(str::trim).filter(|note| !note.is_empty());
    if note.is_some_and(|note| note.chars().count() > 4_000) {
        return Err(CoreError::Config("Annotation note is too long".into()));
    }
    Ok(note.map(ToOwned::to_owned))
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

    #[tokio::test]
    async fn should_round_trip_bookmark_when_reader_adds_and_removes_location() {
        let sidecar = tempfile::tempdir().unwrap();
        let library = tempfile::tempdir().unwrap();
        seed_library_uuid(library.path()).await;
        let locator =
            r#"{"href":"chapter.xhtml","type":"application/xhtml+xml","locations":{"position":3}}"#;

        let added = super::add_reader_bookmark(
            sidecar.path(),
            library.path(),
            42,
            "epub",
            "chapter.xhtml@3",
            locator,
            900,
        )
        .await
        .unwrap();
        assert_eq!(added.format, "EPUB");
        assert_eq!(added.locator["locations"]["position"], 3);

        super::remove_reader_bookmark(
            sidecar.path(),
            library.path(),
            42,
            "EPUB",
            "chapter.xhtml@3",
            901,
        )
        .await
        .unwrap();
        assert!(super::list_reader_bookmarks(sidecar.path(), 42, "EPUB")
            .await
            .unwrap()
            .is_empty());

        let revived = super::add_reader_bookmark(
            sidecar.path(),
            library.path(),
            42,
            "EPUB",
            "chapter.xhtml@3",
            locator,
            902,
        )
        .await
        .unwrap();
        assert_eq!(revived.id, added.id);
    }

    #[tokio::test]
    async fn should_not_create_change_when_bookmark_state_is_unchanged() {
        let sidecar = tempfile::tempdir().unwrap();
        let library = tempfile::tempdir().unwrap();
        seed_library_uuid(library.path()).await;
        let locator = r#"{"href":"chapter.xhtml","type":"application/xhtml+xml"}"#;

        super::add_reader_bookmark(
            sidecar.path(),
            library.path(),
            42,
            "EPUB",
            "chapter.xhtml",
            locator,
            900,
        )
        .await
        .unwrap();
        super::add_reader_bookmark(
            sidecar.path(),
            library.path(),
            42,
            "EPUB",
            "chapter.xhtml",
            locator,
            901,
        )
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
    async fn should_round_trip_annotation_when_reader_creates_updates_and_deletes_highlight() {
        let sidecar = tempfile::tempdir().unwrap();
        let library = tempfile::tempdir().unwrap();
        seed_library_uuid(library.path()).await;
        let locator = r#"{"href":"chapter.xhtml","type":"application/xhtml+xml","text":{"highlight":"Selected text"}}"#;

        let created = super::add_reader_annotation(
            sidecar.path(),
            library.path(),
            42,
            "epub",
            locator,
            "yellow",
            Some(" Initial note "),
            900,
        )
        .await
        .unwrap();
        assert_eq!(created.note.as_deref(), Some("Initial note"));

        let updated = super::update_reader_annotation(
            sidecar.path(),
            library.path(),
            42,
            "EPUB",
            &created.id,
            "green",
            Some("Updated"),
            901,
        )
        .await
        .unwrap();
        assert_eq!(updated.locator, created.locator);
        assert_eq!(updated.color, "green");
        assert_eq!(updated.note.as_deref(), Some("Updated"));

        super::remove_reader_annotation(
            sidecar.path(),
            library.path(),
            42,
            "EPUB",
            &created.id,
            902,
        )
        .await
        .unwrap();
        assert!(super::list_reader_annotations(sidecar.path(), 42, "EPUB")
            .await
            .unwrap()
            .is_empty());
    }

    #[tokio::test]
    async fn should_reject_annotation_when_selected_text_is_missing() {
        let sidecar = tempfile::tempdir().unwrap();
        let library = tempfile::tempdir().unwrap();
        seed_library_uuid(library.path()).await;

        let error = super::add_reader_annotation(
            sidecar.path(),
            library.path(),
            42,
            "EPUB",
            r#"{"href":"chapter.xhtml","type":"application/xhtml+xml"}"#,
            "yellow",
            None,
            900,
        )
        .await
        .unwrap_err();

        assert!(error.to_string().contains("Annotation locator is invalid"));
    }
}
