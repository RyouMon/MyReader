use myreader_sync::document::{FavoriteValue, ReadingPositionValue};
use myreader_sync::document_engine::{
    execute_document_command, DocumentCommand, DocumentCommandRequest,
};

const LIBRARY_UUID: &str = "11111111-2222-4333-8444-555555555555";
const REPLICA_ID: &str = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

fn execute(
    snapshot: Option<&[u8]>,
    command: DocumentCommand,
    base_heads: Vec<String>,
) -> myreader_sync::document_engine::DocumentCommandResult {
    execute_document_command(
        snapshot,
        DocumentCommandRequest {
            replica_id: REPLICA_ID.to_owned(),
            expected_library_uuid: Some(LIBRARY_UUID.to_owned()),
            base_heads,
            command,
        },
        None,
    )
    .unwrap()
}

#[test]
fn engine_should_return_snapshot_changes_and_projections_when_domain_commands_execute() {
    let initialized = execute(
        None,
        DocumentCommand::SetLibraryIdentity {
            library_uuid: LIBRARY_UUID.to_owned(),
            recorded_at: 1,
        },
        Vec::new(),
    );
    let updated = execute(
        Some(&initialized.snapshot_bytes),
        DocumentCommand::SetReadingPosition {
            book_id: 7,
            value: ReadingPositionValue {
                format: "EPUB".to_owned(),
                locator_json: r#"{"href":"chapter-2.xhtml"}"#.to_owned(),
                display_progression_ppm: Some(420_000),
                recorded_at: 2,
                replica_id: REPLICA_ID.to_owned(),
            },
        },
        initialized.heads,
    );
    let favorited = execute(
        Some(&updated.snapshot_bytes),
        DocumentCommand::SetFavorite {
            book_id: 7,
            value: FavoriteValue {
                is_favorite: true,
                added_at: Some(3),
                recorded_at: 3,
                replica_id: REPLICA_ID.to_owned(),
            },
        },
        updated.heads,
    );

    assert_eq!(favorited.changes.len(), 1);
    assert!(!favorited.incremental_bytes.is_empty());
    assert_eq!(favorited.projection.reading_positions[0].book_id, 7);
    assert_eq!(favorited.projection.favorites[0].book_id, 7);
    assert!(favorited.projection.favorites[0].value.is_favorite);
}
