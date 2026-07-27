use std::collections::BTreeMap;
use std::path::Path;

use crate::database;
use crate::models::{FileState, FileStateUpdate};
use crate::repositories::calibre::CalibreBookRepository;
use crate::repositories::content::ContentRepository;
use crate::CoreError;

pub(crate) async fn list_reading_formats(
    sidecar_root: &Path,
    library_root: &Path,
) -> Result<BTreeMap<String, String>, CoreError> {
    let db = database::open_db(&sidecar_root.to_string_lossy()).await?;
    let rows = ContentRepository::new(&db).list_reading_formats().await?;
    let books = CalibreBookRepository::open(&library_root.to_string_lossy())
        .await?
        .get_book_summaries()
        .await?;
    let formats_by_book = books
        .into_iter()
        .map(|book| (book.id, readable_formats(&book.formats)))
        .collect::<BTreeMap<_, _>>();

    Ok(rows
        .into_iter()
        .filter_map(|row| {
            let readable = formats_by_book.get(&row.book_id)?;
            let format = row.reading_format.to_uppercase();
            (readable.len() > 1 && readable.contains(&format))
                .then(|| (row.book_id.to_string(), format))
        })
        .collect())
}

pub(crate) async fn set_reading_format(
    sidecar_root: &Path,
    library_root: &Path,
    book_id: i64,
    format: Option<&str>,
) -> Result<(), CoreError> {
    let db = database::open_db(&sidecar_root.to_string_lossy()).await?;
    let repository = ContentRepository::new(&db);
    let Some(format) = format else {
        return repository.clear_reading_format(book_id).await;
    };

    let book = CalibreBookRepository::open(&library_root.to_string_lossy())
        .await?
        .get_book_summaries()
        .await?
        .into_iter()
        .find(|book| book.id == book_id)
        .ok_or_else(|| CoreError::NotFound(format!("BOOK_NOT_FOUND: {book_id}")))?;
    let readable = readable_formats(&book.formats);
    if readable.len() <= 1 {
        return repository.clear_reading_format(book_id).await;
    }

    let format = format.to_uppercase();
    if !readable.contains(&format) {
        return Err(CoreError::Config(format!(
            "BOOK_READING_FORMAT_NOT_READABLE: {format}"
        )));
    }
    repository.set_reading_format(book_id, &format).await
}

pub(crate) async fn get_file_state(
    sidecar_root: &Path,
    path: &str,
) -> Result<Option<FileState>, CoreError> {
    let db = database::open_db(&sidecar_root.to_string_lossy()).await?;
    ContentRepository::new(&db).get_file_state(path).await
}

pub(crate) async fn get_file_states(
    sidecar_root: &Path,
    paths: &[String],
) -> Result<BTreeMap<String, FileState>, CoreError> {
    let db = database::open_db(&sidecar_root.to_string_lossy()).await?;
    Ok(ContentRepository::new(&db)
        .get_file_states(paths)
        .await?
        .into_iter()
        .collect())
}

pub(crate) async fn list_file_states(sidecar_root: &Path) -> Result<Vec<FileState>, CoreError> {
    let db = database::open_db(&sidecar_root.to_string_lossy()).await?;
    ContentRepository::new(&db).list_file_states().await
}

pub(crate) async fn upsert_file_state(
    sidecar_root: &Path,
    path: &str,
    update: FileStateUpdate,
) -> Result<(), CoreError> {
    let db = database::open_db(&sidecar_root.to_string_lossy()).await?;
    ContentRepository::new(&db)
        .upsert_file_state(path, update)
        .await
}

pub(crate) async fn delete_file_state(sidecar_root: &Path, path: &str) -> Result<(), CoreError> {
    let db = database::open_db(&sidecar_root.to_string_lossy()).await?;
    ContentRepository::new(&db).delete_file_state(path).await
}

fn readable_formats(formats: &[String]) -> Vec<String> {
    let mut result = formats
        .iter()
        .map(|format| format.to_uppercase())
        .filter(|format| matches!(format.as_str(), "EPUB" | "CBZ" | "PDF"))
        .collect::<Vec<_>>();
    result.sort();
    result.dedup();
    result
}

#[cfg(test)]
mod tests {
    use std::collections::BTreeMap;
    use std::path::Path;

    use sea_orm::{ActiveModelTrait, ConnectionTrait, Database, Schema, Set};

    use crate::entities::calibre::{books, data};
    use crate::models::FileStateUpdate;

    async fn seed_catalog(root: &Path) {
        let db = Database::connect(format!(
            "sqlite://{}?mode=rwc",
            root.join("metadata.db").display()
        ))
        .await
        .unwrap();
        let schema = Schema::new(db.get_database_backend());
        for statement in [
            schema.create_table_from_entity(books::Entity),
            schema.create_table_from_entity(data::Entity),
        ] {
            db.execute(&statement).await.unwrap();
        }
        books::ActiveModel {
            id: Set(42),
            title: Set(Some("The Dispossessed".into())),
            path: Set(Some("Ursula K. Le Guin/The Dispossessed".into())),
            ..Default::default()
        }
        .insert(&db)
        .await
        .unwrap();
        for (id, format) in [(1, "EPUB"), (2, "PDF")] {
            data::ActiveModel {
                id: Set(id),
                book: Set(42),
                format: Set(format.into()),
                uncompressed_size: Set(100),
                name: Set("The Dispossessed".into()),
            }
            .insert(&db)
            .await
            .unwrap();
        }
    }

    #[tokio::test]
    async fn should_validate_and_list_reading_format_when_book_has_multiple_formats() {
        let sidecar = tempfile::tempdir().unwrap();
        let library = tempfile::tempdir().unwrap();
        seed_catalog(library.path()).await;

        super::set_reading_format(sidecar.path(), library.path(), 42, Some("pdf"))
            .await
            .unwrap();

        assert_eq!(
            super::list_reading_formats(sidecar.path(), library.path())
                .await
                .unwrap(),
            BTreeMap::from([("42".into(), "PDF".into())])
        );
    }

    #[tokio::test]
    async fn should_round_trip_file_state_when_download_state_changes() {
        let sidecar = tempfile::tempdir().unwrap();
        let path = "Ursula K. Le Guin/The Dispossessed/The Dispossessed.epub";

        super::upsert_file_state(
            sidecar.path(),
            path,
            FileStateUpdate {
                local_state: "present".into(),
                local_blake3: Some("digest".into()),
                local_size: Some(1024),
                local_mtime: Some(1000),
            },
        )
        .await
        .unwrap();

        let state = super::get_file_state(sidecar.path(), path)
            .await
            .unwrap()
            .unwrap();
        assert_eq!(state.local_state, "present");
        assert_eq!(state.local_size, Some(1024));

        super::delete_file_state(sidecar.path(), path)
            .await
            .unwrap();
        assert!(super::get_file_state(sidecar.path(), path)
            .await
            .unwrap()
            .is_none());
    }
}
