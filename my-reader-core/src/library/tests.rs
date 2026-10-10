use sea_orm::TransactionTrait;

use super::*;

const LIBRARY_UUID: &str = "018f2f8d-980b-40ef-b72e-c6e86cb7cc28";
const OTHER_UUID: &str = "028f2f8d-980b-40ef-b72e-c6e86cb7cc28";

fn write_marker(root: &Path, uuid: &str) {
    let path = root.join(MYREADER_LIBRARY_MARKER_RELATIVE_PATH);
    std::fs::create_dir_all(path.parent().unwrap()).unwrap();
    std::fs::write(
        path,
        serde_json::to_vec(&MyReaderLibraryMarker::new(uuid).unwrap()).unwrap(),
    )
    .unwrap();
}

#[tokio::test]
async fn source_identity_and_device_replica_stay_separate() {
    let source = tempfile::tempdir().unwrap();
    let first = tempfile::tempdir().unwrap();
    let second = tempfile::tempdir().unwrap();
    write_marker(source.path(), LIBRARY_UUID);
    let a = LibraryContext::open(first.path()).await.unwrap();
    let a_identity = a.identity(source.path()).await.unwrap();
    let reopened = LibraryContext::open(first.path()).await.unwrap();
    assert_eq!(reopened.identity(source.path()).await.unwrap(), a_identity);
    let b = LibraryContext::open(second.path()).await.unwrap();
    let b_identity = b.identity(source.path()).await.unwrap();
    assert_eq!(a_identity.library_uuid.as_str(), LIBRARY_UUID);
    assert_eq!(b_identity.library_uuid.as_str(), LIBRARY_UUID);
    assert_ne!(a_identity.replica_id, b_identity.replica_id);
    assert!(!source.path().join(".myreader/myreader.db").exists());

    write_marker(source.path(), OTHER_UUID);
    assert!(matches!(
        a.identity(source.path()).await,
        Err(CoreError::Sync(_))
    ));
    write_marker(source.path(), LIBRARY_UUID);
    assert_eq!(a.identity(source.path()).await.unwrap(), a_identity);
}

#[tokio::test]
async fn calibre_identity_does_not_require_catalog_schema_or_modify_source() {
    let source = tempfile::tempdir().unwrap();
    let path = source.path().join("metadata.db");
    {
        let db = rusqlite::Connection::open(&path).unwrap();
        db.execute_batch("CREATE TABLE library_id (id INTEGER PRIMARY KEY, uuid TEXT);")
            .unwrap();
        db.execute(
            "INSERT INTO library_id VALUES (1, ?1)",
            [LIBRARY_UUID.to_uppercase()],
        )
        .unwrap();
    }
    let original = std::fs::read(&path).unwrap();
    // Calibre keeps precedence if a marker is also present.
    write_marker(source.path(), OTHER_UUID);
    let sidecar = tempfile::tempdir().unwrap();
    let context = LibraryContext::open(sidecar.path()).await.unwrap();
    assert_eq!(
        context
            .identity(source.path())
            .await
            .unwrap()
            .library_uuid
            .as_str(),
        LIBRARY_UUID
    );
    assert_eq!(std::fs::read(&path).unwrap(), original);
    assert!(!source.path().join(".myreader/myreader.db").exists());
}

#[tokio::test]
async fn context_uses_existing_close_and_removal_lifecycle() {
    let directory = tempfile::tempdir().unwrap();
    let removed_root = directory.path().join("removed");
    let retained_root = directory.path().join("retained");
    let context = LibraryContext::open(&removed_root).await.unwrap();
    let retained = LibraryContext::open(&retained_root).await.unwrap();
    let transaction = context.database().begin().await.unwrap();
    let mut removal = Box::pin(crate::api::close_library_database(Path::new(
        context.path(),
    )));
    std::future::poll_fn(|cx| {
        assert!(std::future::Future::poll(removal.as_mut(), cx).is_pending());
        std::task::Poll::Ready(())
    })
    .await;
    assert!(LibraryContext::open(&removed_root).await.is_err());
    retained.database().ping().await.unwrap();
    transaction.commit().await.unwrap();
    let removal = removal.await.unwrap();
    assert!(context.database().ping().await.is_err());
    std::fs::remove_dir_all(&removed_root).unwrap();
    removal.commit();
    assert!(LibraryContext::open(&removed_root).await.is_err());
    assert!(context.identity_for_uuid(LIBRARY_UUID).await.is_err());
    assert!(!removed_root.exists());
    retained.database().ping().await.unwrap();
}

#[test]
fn writable_access_preserves_source_permissions_and_marker_errors() {
    let source = tempfile::tempdir().unwrap();
    write_marker(source.path(), LIBRARY_UUID);
    let config: AppConfig = serde_json::from_value(serde_json::json!({
        "schemaVersion": crate::models::APP_CONFIG_SCHEMA_VERSION,
        "libraries": [{
            "id": "library", "name": "Library", "path": "library",
            "libraryType": "myreader", "bookCount": 0,
            "sourceType": "webdav", "dataSourceId": "source"
        }],
        "dataSources": [{
            "type": "webdav", "id": "source", "name": "Source",
            "endpoint": "https://example.test", "username": "user"
        }]
    }))
    .unwrap();
    assert_eq!(
        writable_myreader_library(&config, "library", source.path(), 0)
            .unwrap()
            .1
            .library_uuid,
        LIBRARY_UUID
    );
    let mut readonly = config.clone();
    if let DataSource::Webdav { readonly, .. } = &mut readonly.data_sources[0] {
        *readonly = Some(true);
    }
    assert!(
        matches!(writable_myreader_library(&readonly, "library", source.path(), 0), Err(CoreError::Config(message)) if message == "DATASOURCE_READ_ONLY")
    );
    let mut mismatch = config.clone();
    mismatch.libraries[0].source_type = Some("onedrive".into());
    assert!(
        matches!(writable_myreader_library(&mismatch, "library", source.path(), 0), Err(CoreError::Config(message)) if message == "LIBRARY_DATASOURCE_TYPE_MISMATCH")
    );
    let mut missing = config.clone();
    missing.libraries[0].data_source_id = None;
    assert!(
        matches!(writable_myreader_library(&missing, "library", source.path(), 0), Err(CoreError::Config(message)) if message == "REMOTE_LIBRARY_MISSING_DATASOURCE")
    );
    let mut calibre = config.clone();
    for source_type in [None, Some(LibrarySourceType::from("future_backend"))] {
        let mut unsupported = config.clone();
        unsupported.libraries[0].source_type = source_type;
        assert!(
            matches!(writable_myreader_library(&unsupported, "library", source.path(), 0), Err(CoreError::Config(message)) if message == "MYREADER_LIBRARY_SOURCE_REQUIRED")
        );
    }
    calibre.libraries[0].library_type = LibraryType::Calibre;
    assert!(
        matches!(writable_myreader_library(&calibre, "library", source.path(), 0), Err(CoreError::Config(message)) if message == "LIBRARY_NOT_MYREADER")
    );
    std::fs::write(source.path().join("metadata.db"), []).unwrap();
    assert!(matches!(
        writable_myreader_library(&config, "library", source.path(), 0),
        Err(CoreError::LibraryContainsMetadataDb)
    ));
    std::fs::remove_file(source.path().join("metadata.db")).unwrap();
    std::fs::write(
        source.path().join(MYREADER_LIBRARY_MARKER_RELATIVE_PATH),
        "invalid",
    )
    .unwrap();
    assert!(matches!(
        writable_myreader_library(&config, "library", source.path(), 0),
        Err(CoreError::DataIntegrity(_))
    ));
}

#[cfg(unix)]
#[tokio::test]
async fn invalid_utf8_path_is_rejected_without_creating_a_lossy_directory() {
    use std::{ffi::OsString, os::unix::ffi::OsStringExt};
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join(OsString::from_vec(vec![0xff]));
    assert!(
        matches!(LibraryContext::open(&path).await, Err(CoreError::Config(message)) if message == "LIBRARY_PATH_INVALID_UTF8")
    );
    assert!(!path.exists());
    assert!(!Path::new(&path.to_string_lossy().into_owned()).exists());
}
