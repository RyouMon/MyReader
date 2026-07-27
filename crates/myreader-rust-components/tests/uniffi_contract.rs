use myreader_rust_components::{execute_sync_document_command, sync_contract_version};
use serde_json::json;

#[test]
fn uniffi_contract_should_return_portable_result_when_sync_command_executes() {
    let request = json!({
        "replicaId": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        "expectedLibraryUuid": "11111111-2222-4333-8444-555555555555",
        "baseHeads": [],
        "command": {
            "type": "setLibraryIdentity",
            "libraryUuid": "11111111-2222-4333-8444-555555555555",
            "recordedAt": 1
        }
    });

    let result = execute_sync_document_command(None, request.to_string(), None).unwrap();

    assert_eq!(sync_contract_version(), 2);
    assert_eq!(result.schema_version, 1);
    assert_eq!(result.changes.len(), 2);
    assert!(!result.snapshot_bytes.is_empty());
    assert!(result.projection_json.contains("\"readingPositions\":[]"));
}
