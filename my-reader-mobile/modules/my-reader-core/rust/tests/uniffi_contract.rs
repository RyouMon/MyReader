use my_reader_core_ffi::{core_contract_version, invoke_core_async, invoke_core_sync};
use rusqlite::Connection;

fn create_calibre_library() -> tempfile::TempDir {
    let directory = tempfile::tempdir().unwrap();
    let connection = Connection::open(directory.path().join("metadata.db")).unwrap();
    connection
        .execute_batch(
            "CREATE TABLE library_id (
                id INTEGER PRIMARY KEY,
                uuid TEXT NOT NULL UNIQUE
             );
             INSERT INTO library_id (id, uuid)
             VALUES (1, '11111111-2222-4333-8444-555555555555');",
        )
        .unwrap();
    directory
}

#[test]
fn should_route_catalog_validation_when_transport_receives_typed_request() {
    let library = create_calibre_library();
    let request = serde_json::json!({
        "domain": "catalog",
        "request": {
            "operation": "validateLibrary",
            "input": {
                "libraryRootPath": library.path(),
            },
        },
    });

    let response = invoke_core_sync(request.to_string()).unwrap();

    assert_eq!(core_contract_version(), 2);
    assert_eq!(
        serde_json::from_str::<serde_json::Value>(&response).unwrap(),
        serde_json::json!({
            "domain": "catalog",
            "response": {
                "operation": "validateLibrary",
                "output": true,
            },
        })
    );
}

#[test]
fn should_route_catalog_count_when_async_transport_receives_typed_request() {
    let directory = tempfile::tempdir().unwrap();
    let connection = Connection::open(directory.path().join("metadata.db")).unwrap();
    connection
        .execute_batch(
            "CREATE TABLE books (
                id INTEGER PRIMARY KEY,
                title TEXT,
                sort TEXT,
                timestamp TEXT,
                pubdate TEXT,
                series_index REAL,
                author_sort TEXT,
                isbn TEXT,
                lccn TEXT,
                path TEXT,
                flags INTEGER,
                uuid TEXT,
                has_cover INTEGER,
                last_modified TEXT
             );
             INSERT INTO books (id) VALUES (1), (2);",
        )
        .unwrap();
    let request = serde_json::json!({
        "domain": "catalog",
        "request": {
            "operation": "countBooks",
            "input": {
                "libraryRootPath": directory.path(),
            },
        },
    });

    let response = invoke_core_async(request.to_string()).unwrap();

    assert_eq!(
        serde_json::from_str::<serde_json::Value>(&response).unwrap(),
        serde_json::json!({
            "domain": "catalog",
            "response": {
                "operation": "countBooks",
                "output": 2,
            },
        })
    );
}

#[test]
fn should_apply_download_state_when_sync_transport_reports_progress() {
    let task_id = "transport-download-contract";
    let enqueue = serde_json::json!({
        "domain": "download",
        "request": {
            "operation": "enqueue",
            "input": {
                "id": task_id,
                "libraryId": "library-download-contract",
                "bookId": "42",
                "format": "epub",
                "relativePath": "Author/Book/book.epub",
                "label": "Book",
            },
        },
    });

    let enqueued = invoke_core_sync(enqueue.to_string()).unwrap();
    let enqueued = serde_json::from_str::<serde_json::Value>(&enqueued).unwrap();

    assert_eq!(enqueued["response"]["output"]["inserted"], true);
    assert_eq!(enqueued["response"]["output"]["task"]["status"], "queued");

    let claim = serde_json::json!({
        "domain": "download",
        "request": {
            "operation": "claim",
            "input": { "taskId": task_id },
        },
    });
    let claimed = invoke_core_sync(claim.to_string()).unwrap();
    let claimed = serde_json::from_str::<serde_json::Value>(&claimed).unwrap();
    assert_eq!(claimed["response"]["output"]["status"], "starting");

    let progress = serde_json::json!({
        "domain": "download",
        "request": {
            "operation": "reportProgress",
            "input": {
                "taskId": task_id,
                "received": 25,
                "total": 100,
            },
        },
    });
    let progress = invoke_core_sync(progress.to_string()).unwrap();
    let progress = serde_json::from_str::<serde_json::Value>(&progress).unwrap();
    assert_eq!(progress["response"]["output"]["status"], "downloading");
    assert_eq!(progress["response"]["output"]["progress"], 0.25);

    let cancel = serde_json::json!({
        "domain": "download",
        "request": {
            "operation": "cancel",
            "input": { "taskId": task_id },
        },
    });
    let cancelled = invoke_core_sync(cancel.to_string()).unwrap();
    let cancelled = serde_json::from_str::<serde_json::Value>(&cancelled).unwrap();
    assert_eq!(cancelled["response"]["output"], true);

    let release = serde_json::json!({
        "domain": "download",
        "request": {
            "operation": "release",
            "input": { "taskId": task_id },
        },
    });
    invoke_core_sync(release.to_string()).unwrap();
}

#[test]
fn should_run_sidecar_sync_when_async_transport_has_no_tokio_runtime() {
    let sidecar_directory = tempfile::tempdir().unwrap();
    let library_directory = create_calibre_library();
    let remote_directory = tempfile::tempdir().unwrap();
    let request = serde_json::json!({
        "domain": "sync",
        "request": {
            "operation": "runSidecar",
            "input": {
                "taskId": "transport-sync-task",
                "sidecarRootPath": sidecar_directory.path(),
                "libraryRootPath": library_directory.path(),
                "nowMs": 100,
                "mode": "full",
                "storage": {
                    "kind": "local-direct",
                    "root": remote_directory.path(),
                },
            },
        },
    });

    let report = invoke_core_async(request.to_string()).unwrap();
    let report = serde_json::from_str::<serde_json::Value>(&report).unwrap();

    assert!(report["response"]["output"]["pushed"].as_u64().unwrap() > 0);
    assert_eq!(report["response"]["output"]["pulled"], 0);

    let release = serde_json::json!({
        "domain": "sync",
        "request": {
            "operation": "releaseTask",
            "input": { "taskId": "transport-sync-task" },
        },
    });
    invoke_core_sync(release.to_string()).unwrap();
}

#[test]
fn should_reject_async_operation_when_sync_transport_receives_request() {
    let request = serde_json::json!({
        "domain": "catalog",
        "request": {
            "operation": "countBooks",
            "input": {
                "libraryRootPath": "/library",
            },
        },
    });

    let error = invoke_core_sync(request.to_string()).unwrap_err();

    assert!(error.to_string().contains("unknown variant `countBooks`"));
}

#[test]
fn should_route_registry_initialization_when_transport_receives_typed_request() {
    let directory = tempfile::tempdir().unwrap();
    let registry_path = directory.path().join("device-registry.json");
    let request = serde_json::json!({
        "domain": "registry",
        "request": {
            "operation": "initialize",
            "input": {
                "registryPath": registry_path,
                "legacyRegistry": null,
            },
        },
    });

    let response = invoke_core_async(request.to_string()).unwrap();

    assert_eq!(
        serde_json::from_str::<serde_json::Value>(&response).unwrap(),
        serde_json::json!({
            "domain": "registry",
            "response": {
                "operation": "initialize",
                "output": {
                    "schemaVersion": 1,
                    "dataSources": [],
                    "libraries": [],
                    "activeLibraryId": null,
                },
            },
        })
    );
    assert!(registry_path.exists());
}

#[test]
fn should_round_trip_cover_manifest_when_transport_owns_database() {
    let directory = tempfile::tempdir().unwrap();
    let upsert = serde_json::json!({
        "domain": "content",
        "request": {
            "operation": "upsertCoverThumbnailCache",
            "input": {
                "sidecarRootPath": directory.path(),
                "patch": {
                    "bookId": 42,
                    "coverIdentity": "cover-v2",
                    "thumbnailVersion": "v3",
                    "widthPx": 180,
                    "heightPx": 270,
                    "fileName": "42.jpg",
                    "fileSizeBytes": 2048,
                },
            },
        },
    });
    invoke_core_async(upsert.to_string()).unwrap();
    let list = serde_json::json!({
        "domain": "content",
        "request": {
            "operation": "listCoverThumbnailCache",
            "input": {
                "sidecarRootPath": directory.path(),
                "thumbnailVersion": "v3",
                "widthPx": 180,
                "heightPx": 270,
            },
        },
    });

    let response = invoke_core_async(list.to_string()).unwrap();
    let response = serde_json::from_str::<serde_json::Value>(&response).unwrap();

    assert_eq!(response["response"]["output"][0]["bookId"], 42);
    assert_eq!(response["response"]["output"][0]["fileName"], "42.jpg");
}

#[test]
fn should_return_locator_object_when_transport_reads_position() {
    let sidecar_directory = tempfile::tempdir().unwrap();
    let library_directory = create_calibre_library();
    let set = serde_json::json!({
        "domain": "reading",
        "request": {
            "operation": "setReadingPosition",
            "input": {
                "sidecarRootPath": sidecar_directory.path(),
                "libraryRootPath": library_directory.path(),
                "bookId": 42,
                "format": "EPUB",
                "locator": {
                    "href": "chapter.xhtml",
                    "type": "application/xhtml+xml",
                },
                "displayProgression": 0.4,
                "recordedAtMs": 900,
            },
        },
    });
    invoke_core_async(set.to_string()).unwrap();
    let get = serde_json::json!({
        "domain": "reading",
        "request": {
            "operation": "getReadingPosition",
            "input": {
                "sidecarRootPath": sidecar_directory.path(),
                "bookId": 42,
                "format": "EPUB",
            },
        },
    });

    let response = invoke_core_async(get.to_string()).unwrap();
    let response = serde_json::from_str::<serde_json::Value>(&response).unwrap();

    assert_eq!(response["response"]["output"]["bookId"], 42);
    assert_eq!(response["response"]["output"]["displayProgression"], 0.4);
    assert_eq!(
        response["response"]["output"]["locator"]["href"],
        "chapter.xhtml"
    );
}

#[test]
fn should_persist_registry_when_transport_registers_library() {
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join("registry.json");
    let register_request = serde_json::json!({
        "domain": "registry",
        "request": {
            "operation": "registerLibrary",
            "input": {
                "registryPath": path,
                "library": {
                    "id": "library",
                    "name": "Library",
                    "path": "/library",
                    "bookCount": 0,
                    "metadataUri": null,
                    "addedAt": null,
                    "dataSourceId": null,
                    "sourceType": "local",
                    "sourcePath": null,
                    "metadataEtag": null,
                    "securityScopedBookmark": null,
                },
            },
        },
    });

    let response = invoke_core_async(register_request.to_string()).unwrap();
    let registry = serde_json::from_str::<serde_json::Value>(&response).unwrap();
    let persisted_request = serde_json::json!({
        "domain": "registry",
        "request": {
            "operation": "initialize",
            "input": {
                "registryPath": path,
                "legacyRegistry": null,
            },
        },
    });
    let persisted = invoke_core_async(persisted_request.to_string()).unwrap();
    let persisted = serde_json::from_str::<serde_json::Value>(&persisted).unwrap();

    assert_eq!(
        registry["response"]["output"]["activeLibraryId"],
        persisted["response"]["output"]["activeLibraryId"]
    );
    assert_eq!(
        registry["response"]["output"]["libraries"][0]["id"],
        persisted["response"]["output"]["libraries"][0]["id"]
    );
}

#[test]
fn should_return_core_error_when_remote_credential_type_does_not_match_source() {
    let request = serde_json::json!({
        "domain": "registry",
        "request": {
            "operation": "testRemoteDataSource",
            "input": {
                "source": {
                    "type": "webdav",
                    "id": "source",
                    "name": "Source",
                    "enabled": true,
                    "rootPath": null,
                    "readonly": null,
                    "createdAt": null,
                    "endpoint": "https://example.com",
                    "username": "reader",
                    "hasPassword": true,
                    "credentialReference": null,
                },
                "credential": {
                    "type": "onedrive",
                    "accessToken": "token",
                },
            },
        },
    });
    let error = invoke_core_async(request.to_string()).unwrap_err();

    assert!(
        error
            .to_string()
            .contains("DATASOURCE_CREDENTIAL_TYPE_MISMATCH"),
        "unexpected error: {error}"
    );
}

#[test]
fn should_report_missing_task_when_task_is_not_registered() {
    for operation in ["readTaskProgress", "cancelTask", "releaseTask"] {
        let request = serde_json::json!({
            "domain": "sync",
            "request": {
                "operation": operation,
                "input": { "taskId": "missing" },
            },
        });
        let response = invoke_core_sync(request.to_string()).unwrap();
        let response = serde_json::from_str::<serde_json::Value>(&response).unwrap();
        assert!(
            response["response"]["output"].is_null()
                || response["response"]["output"] == serde_json::json!(false)
        );
    }
}

#[test]
fn should_own_retry_schedule_when_transport_uses_sidecar_root() {
    let sidecar_directory = tempfile::tempdir().unwrap();
    let coordinator_id = "coordinator-1";
    let create = serde_json::json!({
        "domain": "sync",
        "request": {
            "operation": "createCoordinator",
            "input": { "coordinatorId": coordinator_id },
        },
    });
    invoke_core_sync(create.to_string()).unwrap();
    let request = serde_json::json!({
        "domain": "sync",
        "request": {
            "operation": "request",
            "input": {
                "coordinatorId": coordinator_id,
                "libraryId": "library-1",
                "mode": "full",
                "reason": "app_foregrounded",
                "timing": "immediate",
                "nowMs": 100,
            },
        },
    });
    let requested = invoke_core_sync(request.to_string()).unwrap();
    let requested = serde_json::from_str::<serde_json::Value>(&requested).unwrap();
    let generation = requested["response"]["output"]["schedules"][0]["generation"]
        .as_u64()
        .unwrap();
    let begin = serde_json::json!({
        "domain": "sync",
        "request": {
            "operation": "begin",
            "input": {
                "coordinatorId": coordinator_id,
                "libraryId": "library-1",
                "generation": generation,
            },
        },
    });
    let begun = invoke_core_sync(begin.to_string()).unwrap();
    let begun = serde_json::from_str::<serde_json::Value>(&begun).unwrap();
    let fail = serde_json::json!({
        "domain": "sync",
        "request": {
            "operation": "fail",
            "input": {
                "coordinatorId": coordinator_id,
                "sidecarRootPath": sidecar_directory.path(),
                "execution": begun["response"]["output"]["execution"],
                "failureKind": "connectivity",
                "reason": "network unavailable",
                "nowMs": 200,
                "randomFraction": 0.5,
            },
        },
    });
    invoke_core_async(fail.to_string()).unwrap();

    let connection = Connection::open(
        sidecar_directory
            .path()
            .join(".myreader")
            .join("myreader.db"),
    )
    .unwrap();
    let (next_retry_at, failure_count): (i64, i64) = connection
        .query_row(
            "SELECT next_retry_at, transient_failure_count
             FROM sync_schedule_state
             WHERE id = 'local'",
            [],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .unwrap();
    assert_eq!(next_retry_at, 1_200);
    assert_eq!(failure_count, 1);
    let dispose = serde_json::json!({
        "domain": "sync",
        "request": {
            "operation": "disposeCoordinator",
            "input": { "coordinatorId": coordinator_id },
        },
    });
    invoke_core_sync(dispose.to_string()).unwrap();
}

#[test]
fn should_preserve_failure_stage_when_transport_returns_original_cause() {
    let sidecar_directory = tempfile::tempdir().unwrap();
    let library_directory = create_calibre_library();
    let request = serde_json::json!({
        "domain": "sync",
        "request": {
            "operation": "runSidecar",
            "input": {
                "taskId": "failing-task",
                "sidecarRootPath": sidecar_directory.path(),
                "libraryRootPath": library_directory.path(),
                "nowMs": 100,
                "mode": "full",
                "storage": { "kind": "local-direct", "root": "" },
            },
        },
    });
    let error = invoke_core_async(request.to_string()).unwrap_err();

    assert!(error.to_string().contains("Local storage root is missing"));
    let read_progress = serde_json::json!({
        "domain": "sync",
        "request": {
            "operation": "readTaskProgress",
            "input": { "taskId": "failing-task" },
        },
    });
    let progress = invoke_core_sync(read_progress.to_string()).unwrap();
    let progress = serde_json::from_str::<serde_json::Value>(&progress).unwrap();
    assert_eq!(progress["response"]["output"]["stage"], "preparing_failed");
}
