mod remote;

use super::*;
use crate::models::{
    LibraryStorageConfig, LocalLibraryRequest, MyReaderLibraryMarker, SidecarSyncMode,
    MYREADER_LIBRARY_MARKER_RELATIVE_PATH,
};
use crate::services::library::LibraryService;
use crate::services::sync::SyncService;

pub(super) async fn fixture() -> (tempfile::TempDir, PathBuf, Library, PathBuf) {
    let temp = tempfile::tempdir().unwrap();
    let config = temp.path().join("app/config.json");
    let root = temp.path().join("external");
    let sidecars = temp.path().join("app/libraries");
    let (_, library) = LibraryService::create_local_myreader(
        &config,
        LocalLibraryRequest {
            library_root_path: root.to_string_lossy().into_owned(),
            path: root.to_string_lossy().into_owned(),
            source_path: None,
            sidecar_container_parent_path: Some(sidecars.to_string_lossy().into_owned()),
            name: Some("Books".into()),
            metadata_uri: None,
            added_at: Some(10.0),
            security_scoped_bookmark: None,
        },
        100,
    )
    .await
    .unwrap();
    let sidecar = sidecars.join(&library.id);
    (temp, config, library, sidecar)
}

pub(super) fn request(path: &Path) -> RelocateLibraryRequest {
    RelocateLibraryRequest {
        target_path: path.to_string_lossy().into_owned(),
        target_uri: None,
        security_scoped_bookmark: None,
    }
}

#[tokio::test]
async fn repair_preserves_identity_data_and_selection_and_rejects_stale_sync() {
    let (temp, config, library, sidecar) = fixture().await;
    let database = LibraryContext::database_path(&sidecar).unwrap();
    let before = persistence::read_database_identity(&database)
        .await
        .unwrap()
        .unwrap();
    let original_storage = LibraryStorageConfig::LocalDirect {
        root: library.path.clone(),
    };
    SyncService::record_suspension(&sidecar, "old path")
        .await
        .unwrap();
    let target = temp.path().join("moved");
    std::fs::rename(&library.path, &target).unwrap();
    let diagnosis =
        LibraryService::diagnose_location(&config, &library.id, Path::new(&library.path), None)
            .await
            .unwrap();
    assert_eq!(diagnosis.problem, Some(Problem::RootMissing));
    assert_eq!(diagnosis.effective_path, library.path);
    let result = LibraryService::relocate(&config, &library.id, &sidecar, request(&target), None)
        .await
        .unwrap();
    assert_eq!(result.location.problem, None);
    let persisted = ConfigService::load(&config).unwrap().unwrap();
    assert_eq!(
        persisted.active_library_id.as_deref(),
        Some(library.id.as_str())
    );
    assert_eq!(persisted.libraries[0].id, library.id);
    assert_eq!(persisted.libraries[0].added_at, library.added_at);
    assert_eq!(
        persisted.libraries[0].path,
        dunce::canonicalize(&target).unwrap().to_string_lossy()
    );
    assert_eq!(
        persistence::read_database_identity(&database)
            .await
            .unwrap()
            .unwrap(),
        before
    );
    assert_eq!(
        SyncService::schedule_snapshot(&sidecar)
            .await
            .unwrap()
            .suspended_reason,
        None
    );
    let sync_error = SyncService::sync_sidecar(
        &sidecar,
        Path::new(&library.path),
        200,
        SidecarSyncMode::Full,
        &original_storage,
    )
    .await
    .unwrap_err();
    let upload_error = crate::services::book_transfer::BookTransferService::upload_pending_books(
        &sidecar,
        Path::new(&library.path),
        &original_storage,
    )
    .await
    .unwrap_err();
    for error in [sync_error, upload_error] {
        assert!(matches!(error, CoreError::Config(code) if code == "LIBRARY_LOCATION_CHANGED"));
    }
    let storage = LibraryStorageConfig::LocalDirect {
        root: dunce::canonicalize(&target)
            .unwrap()
            .to_string_lossy()
            .into_owned(),
    };
    SyncService::sync_sidecar(&sidecar, &target, 200, SidecarSyncMode::Full, &storage)
        .await
        .unwrap();
    assert!(!Path::new(&library.path).exists());
}

#[tokio::test]
async fn refuses_busy_missing_invalid_and_different_targets_without_saving() {
    let (temp, config, library, sidecar) = fixture().await;
    let original = std::fs::read(&config).unwrap();
    let storage = LibraryStorageConfig::LocalDirect {
        root: library.path.clone(),
    };
    let lease = access::acquire(&sidecar, &storage).await.unwrap();
    let busy = LibraryService::relocate(
        &config,
        &library.id,
        &sidecar,
        request(Path::new(&library.path)),
        None,
    )
    .await
    .unwrap();
    assert_eq!(busy.location.problem, Some(Problem::Busy));
    drop(lease);
    for (name, expected) in [
        ("missing", Problem::RootMissing),
        ("empty", Problem::InvalidLibrary),
        ("different", Problem::IdentityMismatch),
    ] {
        let target = temp.path().join(name);
        if name != "missing" {
            std::fs::create_dir_all(&target).unwrap();
        }
        if name == "different" {
            std::fs::create_dir_all(target.join(".myreader")).unwrap();
            let marker = MyReaderLibraryMarker::new(&uuid::Uuid::new_v4().to_string()).unwrap();
            std::fs::write(
                target.join(MYREADER_LIBRARY_MARKER_RELATIVE_PATH),
                serde_json::to_vec(&marker).unwrap(),
            )
            .unwrap();
        }
        let result =
            LibraryService::relocate(&config, &library.id, &sidecar, request(&target), None)
                .await
                .unwrap();
        assert_eq!(
            result.location.problem,
            Some(expected),
            "{name}: {result:?}"
        );
        assert!(result.config.is_none());
        assert_eq!(std::fs::read(&config).unwrap(), original);
    }
}

#[tokio::test]
async fn missing_sync_objects_do_not_mean_missing_root() {
    let (_temp, config, library, _) = fixture().await;
    let location =
        LibraryService::diagnose_location(&config, &library.id, Path::new(&library.path), None)
            .await
            .unwrap();
    assert_eq!(location.problem, None);
    assert!(!Path::new(&library.path)
        .join(".myreader/automerge")
        .exists());
}

#[tokio::test]
async fn preserves_reading_state_outbox_and_cached_content() {
    use crate::services::reading::ReadingService;
    let (temp, config, library, sidecar) = fixture().await;
    let root = Path::new(&library.path);
    let locator = r#"{"href":"chapter.xhtml","type":"application/xhtml+xml","locations":{"position":3},"text":{"highlight":"Selected text"}}"#;
    ReadingService::set_favorite_book(&sidecar, root, 1, true, 101)
        .await
        .unwrap();
    ReadingService::set_reading_position(&sidecar, root, 1, "EPUB", locator, Some(0.5), 102)
        .await
        .unwrap();
    ReadingService::add_reader_bookmark(&sidecar, root, 1, "EPUB", "chapter-3", locator, 103)
        .await
        .unwrap();
    ReadingService::add_reader_annotation(
        &sidecar,
        root,
        1,
        "EPUB",
        locator,
        "yellow",
        Some("My note"),
        104,
    )
    .await
    .unwrap();
    let database = LibraryContext::database_path(&sidecar).unwrap();
    let identity = persistence::read_database_identity(&database)
        .await
        .unwrap()
        .unwrap();
    let snapshot = persistence::inspect_for_sync(&database, &identity)
        .await
        .unwrap();
    let outbox = persistence::list_publishable_outbox(&database)
        .await
        .unwrap();
    assert!(!outbox.as_ref().unwrap().is_empty());
    let cache = sidecar.join("download.epub");
    std::fs::write(&cache, b"cached-content").unwrap();
    let target = temp.path().join("moved");
    std::fs::rename(root, &target).unwrap();
    let result = LibraryService::relocate(&config, &library.id, &sidecar, request(&target), None)
        .await
        .unwrap();
    assert_eq!(result.location.problem, None);
    assert_eq!(
        persistence::inspect_for_sync(&database, &identity)
            .await
            .unwrap(),
        snapshot
    );
    assert_eq!(
        persistence::list_publishable_outbox(&database)
            .await
            .unwrap(),
        outbox
    );
    assert_eq!(std::fs::read(cache).unwrap(), b"cached-content");
}

#[tokio::test]
async fn requires_persisted_identity_and_rejects_managed_libraries() {
    let (_temp, config, library, sidecar) = fixture().await;
    let database = LibraryContext::database_path(&sidecar).unwrap();
    rusqlite::Connection::open(&database)
        .unwrap()
        .execute("DELETE FROM sync_local_meta", [])
        .unwrap();
    let original = std::fs::read(&config).unwrap();
    let result = LibraryService::relocate(
        &config,
        &library.id,
        &sidecar,
        request(Path::new(&library.path)),
        None,
    )
    .await
    .unwrap();
    assert_eq!(result.location.problem, Some(Problem::IdentityUnknown));
    assert_eq!(std::fs::read(&config).unwrap(), original);
    ConfigService::mutate_config(&config, |config| {
        config.libraries[0].path = sidecar.to_string_lossy().into_owned();
        Ok(())
    })
    .unwrap();
    let location = LibraryService::describe_location(&config, &library.id).unwrap();
    assert!(!location.can_relocate);
    let result = LibraryService::relocate(
        &config,
        &library.id,
        &sidecar,
        request(Path::new(&library.path)),
        None,
    )
    .await
    .unwrap();
    assert_eq!(result.location.problem, Some(Problem::Managed));
}

#[tokio::test]
async fn replaces_external_bookmark_only_after_validation() {
    use crate::models::SecurityScopedBookmark;
    let (temp, config, library, sidecar) = fixture().await;
    let bookmark = SecurityScopedBookmark {
        bookmark_base64: "old-access".into(),
        resolved_uri: url::Url::from_file_path(&library.path).unwrap().to_string(),
        stale: false,
    };
    ConfigService::mutate_config(&config, |config| {
        config.libraries[0].security_scoped_bookmark = Some(bookmark.clone());
        Ok(())
    })
    .unwrap();
    let target = temp.path().join("moved");
    std::fs::rename(&library.path, &target).unwrap();
    let original = std::fs::read(&config).unwrap();
    let result = LibraryService::relocate(&config, &library.id, &sidecar, request(&target), None)
        .await
        .unwrap();
    assert_eq!(result.location.problem, Some(Problem::Credential));
    assert_eq!(std::fs::read(&config).unwrap(), original);
    let uri = url::Url::from_file_path(dunce::canonicalize(&target).unwrap())
        .unwrap()
        .to_string();
    let bookmark = SecurityScopedBookmark {
        bookmark_base64: "new-access".into(),
        resolved_uri: uri.clone(),
        stale: false,
    };
    let result = LibraryService::relocate(
        &config,
        &library.id,
        &sidecar,
        RelocateLibraryRequest {
            target_path: target.to_string_lossy().into_owned(),
            target_uri: Some(uri.clone()),
            security_scoped_bookmark: Some(bookmark.clone()),
        },
        None,
    )
    .await
    .unwrap();
    let library = &result.config.unwrap().libraries[0];
    assert_eq!(library.path, uri);
    assert_eq!(library.security_scoped_bookmark.as_ref(), Some(&bookmark));
    assert!(access::acquire(
        &sidecar,
        &LibraryStorageConfig::LocalDirect {
            root: dunce::canonicalize(target)
                .unwrap()
                .to_string_lossy()
                .into_owned()
        }
    )
    .await
    .is_ok());
}

#[tokio::test]
async fn calibre_relocation_checks_database_and_library_uuid() {
    let (temp, config, library, sidecar) = fixture().await;
    let identity =
        persistence::read_database_identity(&LibraryContext::database_path(&sidecar).unwrap())
            .await
            .unwrap()
            .unwrap();
    ConfigService::mutate_config(&config, |config| {
        config.libraries[0].library_type = LibraryType::Calibre;
        config.libraries[0].metadata_etag = Some("old-etag".into());
        Ok(())
    })
    .unwrap();
    let target = temp.path().join("calibre");
    std::fs::create_dir_all(&target).unwrap();
    std::fs::write(target.join("metadata.db"), b"not sqlite").unwrap();
    let original = std::fs::read(&config).unwrap();
    let result = LibraryService::relocate(&config, &library.id, &sidecar, request(&target), None)
        .await
        .unwrap();
    assert_eq!(result.location.problem, Some(Problem::InvalidLibrary));
    assert_eq!(std::fs::read(&config).unwrap(), original);
    std::fs::remove_file(target.join("metadata.db")).unwrap();
    {
        let db = rusqlite::Connection::open(target.join("metadata.db")).unwrap();
        db.execute_batch(include_str!(
            "../../../../../tests/fixtures/calibre_books.sql"
        ))
        .unwrap();
        db.execute_batch("CREATE TABLE data (book INTEGER, format TEXT, name TEXT, uncompressed_size INTEGER); CREATE TABLE library_id (uuid TEXT NOT NULL);").unwrap();
        db.execute(
            "INSERT INTO library_id VALUES (?1)",
            [identity.library_uuid.as_str()],
        )
        .unwrap();
    }
    let result = LibraryService::relocate(&config, &library.id, &sidecar, request(&target), None)
        .await
        .unwrap();
    assert_eq!(result.location.problem, None, "{result:?}");
    let saved = &result.config.unwrap().libraries[0];
    assert_eq!(
        Path::new(saved.metadata_uri.as_deref().unwrap()),
        Path::new(&saved.path).join("metadata.db")
    );
    assert_eq!(saved.metadata_etag, None);
}

#[tokio::test]
async fn duplicate_or_concurrent_registry_changes_are_not_overwritten() {
    let (_temp, config, library, sidecar) = fixture().await;
    ConfigService::mutate_config(&config, |config| {
        let mut duplicate = library.clone();
        duplicate.id = "other".into();
        config.libraries.push(duplicate);
        Ok(())
    })
    .unwrap();
    let original = std::fs::read(&config).unwrap();
    let result = LibraryService::relocate(
        &config,
        &library.id,
        &sidecar,
        request(Path::new(&library.path)),
        None,
    )
    .await
    .unwrap();
    assert_eq!(result.location.problem, Some(Problem::SaveFailed));
    assert_eq!(std::fs::read(&config).unwrap(), original);
    ConfigService::mutate_config(&config, |config| {
        config.libraries.pop();
        config.libraries[0].name = "Edited".into();
        Ok(())
    })
    .unwrap();
    assert!(save_location(&config, &library, &library).is_err());
    assert_eq!(
        ConfigService::load(&config).unwrap().unwrap().libraries[0].name,
        "Edited"
    );
}

#[tokio::test]
async fn source_paths_are_scoped_and_credentials_never_enter_display_paths() {
    let (_temp, config, library, _) = fixture().await;
    for source in [
        serde_json::json!({"type":"webdav","id":"source","name":"WebDAV","endpoint":"https://user:secret@example.test/dav?token=secret#secret","username":"reader","rootPath":"/base"}),
        serde_json::json!({"type":"onedrive","id":"source","name":"OneDrive","clientId":"client","rootPath":"/base"}),
    ] {
        ConfigService::mutate_config(&config, |config| {
            config.data_sources = vec![serde_json::from_value(source.clone()).unwrap()];
            config.libraries[0].source_type = Some(source["type"].as_str().unwrap().into());
            config.libraries[0].data_source_id = Some("source".into());
            config.libraries[0].source_path = Some("/Books".into());
            Ok(())
        })
        .unwrap();
        let location = LibraryService::describe_location(&config, &library.id).unwrap();
        assert!(location.effective_path.ends_with("/base/Books"));
        assert!(!location.effective_path.contains("secret"));
        let diagnosis =
            LibraryService::diagnose_location(&config, &library.id, Path::new(&library.path), None)
                .await
                .unwrap();
        assert_eq!(diagnosis.problem, Some(Problem::DataSource));
    }
}
