//! Command-layer integration tests for `src/commands/reading_statistics.rs`.

use my_reader_core::test_support::entities::app::reading_sessions;
use my_reader_lib::models::{AppConfig, LibraryConfig};
use sea_orm::{Database, EntityTrait};
use serde_json::json;

use crate::common::app::TestApp;
use crate::common::calibre::create_calibre_db;
use crate::common::ipc::invoke_ok;

fn library_fixture(id: &str, path: &str) -> LibraryConfig {
    LibraryConfig {
        id: id.into(),
        name: "Library".into(),
        path: path.into(),
        source_type: Some("local".into()),
        data_source_id: None,
        source_path: None,
    }
}

async fn projection_database(app: &TestApp, library_id: &str) -> sea_orm::DatabaseConnection {
    Database::connect(format!(
        "sqlite://{}?mode=ro",
        app.app_data_dir()
            .join("libraries")
            .join(library_id)
            .join(".myreader")
            .join("myreader.db")
            .display()
    ))
    .await
    .unwrap()
}

#[tokio::test]
async fn should_accumulate_duration_when_origin_session_receives_intervals() {
    let calibre = tempfile::tempdir().unwrap();
    create_calibre_db(calibre.path()).await;
    let app = TestApp::with_config(AppConfig {
        libraries: vec![library_fixture(
            "lib-a",
            calibre.path().to_string_lossy().as_ref(),
        )],
        active_library_id: Some("lib-a".into()),
        ..Default::default()
    });
    let id = "11111111111141118111111111111111";

    for (duration, updated_at) in [(30, 130), (15, 145)] {
        let _: () = invoke_ok(
            &app,
            "add_reading_session_interval",
            json!({
                "libraryId": "lib-a",
                "id": id,
                "bookId": 7,
                "format": "EPUB",
                "localDay": "2026-07-25",
                "startedAt": 100,
                "durationSeconds": duration,
                "updatedAt": updated_at,
            }),
        );
    }

    let db = projection_database(&app, "lib-a").await;
    let session = reading_sessions::Entity::find_by_id(id)
        .one(&db)
        .await
        .unwrap()
        .unwrap();
    assert_eq!(session.duration_seconds, 45);
    assert_eq!(session.started_at, 100.0);
}
