use automerge::AutoCommit;
use myreader_rust_components::sync::{
    exchange::{sync_database_with_operator, SyncMode},
    persistence::{ensure_database_document, execute_local_database_mutation, DatabaseIdentity},
    SyncError,
};
use opendal::Operator;
use sea_orm::{ConnectionTrait, DatabaseConnection, DbBackend, Statement};

use crate::error::AppError;

use super::{
    automerge_document::load_library_sidecar_document_bytes, replica_identity::ReplicaIdentity,
};

fn sync_error(message: impl Into<String>) -> AppError {
    AppError::Sync(message.into())
}

fn map_sync_error(error: SyncError) -> AppError {
    match error {
        SyncError::Sync(message) => sync_error(message),
    }
}

fn now_i64(now_ms: u64) -> Result<i64, AppError> {
    i64::try_from(now_ms).map_err(|_| sync_error("Sync time is out of range"))
}

async fn database_path(db: &DatabaseConnection) -> Result<String, AppError> {
    let row = db
        .query_one_raw(Statement::from_string(
            DbBackend::Sqlite,
            "PRAGMA database_list".to_owned(),
        ))
        .await
        .map_err(AppError::from)?
        .ok_or_else(|| sync_error("SQLite database path is unavailable"))?;
    let path: String = row
        .try_get("", "file")
        .map_err(|error| AppError::Database(error.to_string()))?;
    if path.is_empty() {
        return Err(sync_error(
            "Shared sync persistence requires a file-backed SQLite database",
        ));
    }
    Ok(path)
}

fn database_identity(identity: &ReplicaIdentity) -> DatabaseIdentity {
    DatabaseIdentity {
        library_uuid: identity.library_uuid.clone(),
        replica_id: identity.replica_id.clone(),
    }
}

pub async fn ensure_library_sidecar_automerge_state(
    db: &DatabaseConnection,
    identity: &ReplicaIdentity,
    now_ms: u64,
) -> Result<(), AppError> {
    let path = database_path(db).await?;
    ensure_database_document(&path, &database_identity(identity), now_i64(now_ms)?)
        .map_err(map_sync_error)?;
    Ok(())
}

pub async fn read_library_sidecar_automerge_document(
    db: &DatabaseConnection,
    identity: &ReplicaIdentity,
    now_ms: u64,
) -> Result<AutoCommit, AppError> {
    let path = database_path(db).await?;
    let result = ensure_database_document(&path, &database_identity(identity), now_i64(now_ms)?)
        .map_err(map_sync_error)?;
    load_library_sidecar_document_bytes(&result.snapshot_bytes, &identity.replica_id)
        .map_err(map_sync_error)
}

pub async fn commit_library_sidecar_automerge_mutation<F>(
    db: &DatabaseConnection,
    identity: &ReplicaIdentity,
    now_ms: u64,
    mutate: F,
) -> Result<(), AppError>
where
    F: FnOnce(&mut AutoCommit) -> Result<(), AppError>,
{
    let path = database_path(db).await?;
    execute_local_database_mutation(
        &path,
        &database_identity(identity),
        now_i64(now_ms)?,
        |document| mutate(document).map_err(|error| SyncError::Sync(error.to_string())),
    )
    .map_err(map_sync_error)?;
    Ok(())
}

pub async fn sync_library_sidecar_automerge(
    db: &DatabaseConnection,
    operator: &Operator,
    identity: &ReplicaIdentity,
    now_ms: u64,
) -> Result<(usize, usize), AppError> {
    let path = database_path(db).await?;
    let report = sync_database_with_operator(
        &path,
        operator,
        &database_identity(identity),
        now_i64(now_ms)?,
        SyncMode::Full,
    )
    .await
    .map_err(map_sync_error)?;
    Ok((report.pushed, report.pulled))
}

pub async fn publish_library_sidecar_automerge(
    db: &DatabaseConnection,
    operator: &Operator,
    identity: &ReplicaIdentity,
    now_ms: u64,
) -> Result<usize, AppError> {
    let path = database_path(db).await?;
    sync_database_with_operator(
        &path,
        operator,
        &database_identity(identity),
        now_i64(now_ms)?,
        SyncMode::PushOnly,
    )
    .await
    .map(|report| report.pushed)
    .map_err(map_sync_error)
}

#[cfg(test)]
mod tests {
    use myreader_rust_components::sync::persistence::read_database_diagnostics;
    use sea_orm::{DatabaseConnection, EntityTrait};

    use super::*;
    use crate::{
        db,
        entities::app::reading_progress,
        sync::automerge_document::{set_reading_position, ReadingPositionValue},
    };

    const LIBRARY_UUID: &str = "11111111-2222-4333-8444-555555555555";
    const REPLICA_ID: &str = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

    async fn database() -> (tempfile::TempDir, DatabaseConnection) {
        let directory = tempfile::tempdir().unwrap();
        let db = db::open_db(directory.path().to_str().unwrap())
            .await
            .unwrap();
        (directory, db)
    }

    #[tokio::test]
    async fn should_initialize_shared_persistence_when_desktop_adapter_opens_document() {
        let (_directory, db) = database().await;
        let identity = ReplicaIdentity {
            library_uuid: LIBRARY_UUID.to_owned(),
            replica_id: REPLICA_ID.to_owned(),
        };

        ensure_library_sidecar_automerge_state(&db, &identity, 1)
            .await
            .unwrap();

        let path = database_path(&db).await.unwrap();
        let diagnostics = read_database_diagnostics(&path).unwrap();
        assert_eq!(diagnostics.changes, 1);
        assert_eq!(diagnostics.pending_outbox, 1);
    }

    #[tokio::test]
    async fn should_reuse_identical_bytes_when_publication_is_retried() {
        let (_directory, db) = database().await;
        let identity = ReplicaIdentity {
            library_uuid: LIBRARY_UUID.to_owned(),
            replica_id: REPLICA_ID.to_owned(),
        };
        let remote = tempfile::tempdir().unwrap();
        let operator = opendal::Operator::new(
            opendal::services::Fs::default().root(remote.path().to_str().unwrap()),
        )
        .unwrap()
        .finish();

        let first = sync_library_sidecar_automerge(&db, &operator, &identity, 2)
            .await
            .unwrap();
        let second = sync_library_sidecar_automerge(&db, &operator, &identity, 3)
            .await
            .unwrap();

        assert_eq!(first, (1, 0));
        assert_eq!(second, (0, 0));
    }

    #[tokio::test]
    async fn should_project_latest_position_when_desktop_adapters_exchange_changes() {
        let (_desktop_directory, desktop_db) = database().await;
        let (_mobile_directory, mobile_db) = database().await;
        let desktop = ReplicaIdentity {
            library_uuid: LIBRARY_UUID.to_owned(),
            replica_id: REPLICA_ID.to_owned(),
        };
        let mobile = ReplicaIdentity {
            library_uuid: LIBRARY_UUID.to_owned(),
            replica_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb".to_owned(),
        };
        let desktop_replica_id = desktop.replica_id.clone();
        commit_library_sidecar_automerge_mutation(&desktop_db, &desktop, 2, |document| {
            set_reading_position(
                document,
                42,
                &ReadingPositionValue {
                    format: "PDF".to_owned(),
                    locator_json: r#"{"href":"page=7","type":"application/pdf"}"#.to_owned(),
                    display_progression_ppm: Some(700_000),
                    recorded_at: 2,
                    replica_id: desktop_replica_id,
                },
            )
            .map_err(map_sync_error)?;
            Ok(())
        })
        .await
        .unwrap();
        let remote = tempfile::tempdir().unwrap();
        let operator = opendal::Operator::new(
            opendal::services::Fs::default().root(remote.path().to_str().unwrap()),
        )
        .unwrap()
        .finish();

        sync_library_sidecar_automerge(&desktop_db, &operator, &desktop, 3)
            .await
            .unwrap();
        let report = sync_library_sidecar_automerge(&mobile_db, &operator, &mobile, 4)
            .await
            .unwrap();

        assert_eq!(report.1, 2);
        let row = reading_progress::Entity::find()
            .one(&mobile_db)
            .await
            .unwrap()
            .unwrap();
        assert_eq!(row.book_id, 42);
        assert_eq!(
            row.locator_json,
            r#"{"href":"page=7","type":"application/pdf"}"#
        );
        assert_eq!(row.display_progression, Some(0.7));
    }
}
