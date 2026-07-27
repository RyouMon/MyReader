use std::path::Path;

use myreader_sync::{
    document::{favorite_projections, set_favorite, FavoriteValue},
    persistence::{ensure_database_identity, execute_local_database_mutation},
};
use tracing::info;

use crate::database;
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
}
