use opendal::Operator;
use time::{format_description::well_known::Rfc3339, OffsetDateTime};
use uuid::{Uuid, Variant};

use super::contract::ReplicaMetadata;
use super::segment::{SegmentError, SegmentErrorCode};

fn invalid(message: impl Into<String>) -> SegmentError {
    SegmentError::external(SegmentErrorCode::InvalidChange, message)
}

fn required_text(value: &str, field: &str) -> Result<(), SegmentError> {
    if value.trim().is_empty() {
        return Err(invalid(format!("{field} must be non-empty text")));
    }
    Ok(())
}

fn optional_text(value: Option<&str>, field: &str) -> Result<(), SegmentError> {
    if value.is_some_and(|value| value.trim().is_empty()) {
        return Err(invalid(format!(
            "{field} must be non-empty text when present"
        )));
    }
    Ok(())
}

pub fn validate_replica_metadata(
    metadata: &ReplicaMetadata,
    expected_replica_id: Option<&str>,
) -> Result<(), SegmentError> {
    if metadata.schema_version != 1 {
        return Err(invalid("replica metadata schemaVersion is unsupported"));
    }
    let replica_id =
        Uuid::parse_str(&metadata.replica_id).map_err(|_| invalid("replicaId must be a UUIDv4"))?;
    if replica_id.get_version_num() != 4
        || replica_id.get_variant() != Variant::RFC4122
        || replica_id.hyphenated().to_string() != metadata.replica_id
    {
        return Err(invalid("replicaId must be a lowercase UUIDv4"));
    }
    if expected_replica_id.is_some_and(|expected| expected != metadata.replica_id) {
        return Err(invalid(
            "replica metadata identity does not match its directory",
        ));
    }
    OffsetDateTime::parse(&metadata.updated_at, &Rfc3339)
        .map_err(|_| invalid("updatedAt must be an ISO date"))?;
    if let Some(device) = &metadata.device {
        optional_text(device.model.as_deref(), "device.model")?;
    }
    required_text(&metadata.system.name, "system.name")?;
    optional_text(metadata.system.version.as_deref(), "system.version")?;
    required_text(&metadata.app.version, "app.version")?;
    optional_text(metadata.app.build_number.as_deref(), "app.buildNumber")?;
    Ok(())
}

pub fn encode_replica_metadata(metadata: &ReplicaMetadata) -> Result<Vec<u8>, SegmentError> {
    validate_replica_metadata(metadata, Some(&metadata.replica_id))?;
    serde_json::to_vec(metadata).map_err(|error| invalid(error.to_string()))
}

pub fn decode_replica_metadata(
    bytes: &[u8],
    expected_replica_id: &str,
) -> Result<ReplicaMetadata, SegmentError> {
    let metadata: ReplicaMetadata = serde_json::from_slice(bytes).map_err(|_| {
        SegmentError::external(
            SegmentErrorCode::InvalidJson,
            "replica metadata is not valid UTF-8 JSON",
        )
    })?;
    validate_replica_metadata(&metadata, Some(expected_replica_id))?;
    Ok(metadata)
}

pub async fn publish_replica_metadata(
    operator: &Operator,
    metadata: &ReplicaMetadata,
) -> Result<bool, SegmentError> {
    let bytes = encode_replica_metadata(metadata)?;
    let path = format!(".myreader/changes-v4/{}/replica.json", metadata.replica_id);
    Ok(operator.write(&path, bytes).await.is_ok())
}

#[cfg(test)]
mod tests {
    use opendal::{services::Fs, Operator};
    use serde::Deserialize;

    use super::*;

    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct ContractFixture {
        replica_metadata: ReplicaMetadata,
    }

    fn fixture() -> ContractFixture {
        serde_json::from_str(include_str!("fixtures/contract.json"))
            .expect("shared sidecar fixture must parse")
    }

    fn operator(root: &std::path::Path) -> Operator {
        Operator::new(Fs::default().root(root.to_string_lossy().as_ref()))
            .unwrap()
            .finish()
    }

    #[test]
    fn should_preserve_metadata_when_valid_json_is_decoded() {
        let fixture = fixture();
        let bytes = encode_replica_metadata(&fixture.replica_metadata).unwrap();

        assert_eq!(
            decode_replica_metadata(&bytes, &fixture.replica_metadata.replica_id).unwrap(),
            fixture.replica_metadata
        );
    }

    #[tokio::test]
    async fn should_update_metadata_without_changing_replica_identity_when_app_build_changes() {
        let root = tempfile::tempdir().unwrap();
        let operator = operator(root.path());
        let mut metadata = fixture().replica_metadata;
        let path = format!(".myreader/changes-v4/{}/replica.json", metadata.replica_id);

        assert!(publish_replica_metadata(&operator, &metadata)
            .await
            .unwrap());
        metadata.app.build_number = Some("218".to_owned());
        assert!(publish_replica_metadata(&operator, &metadata)
            .await
            .unwrap());

        let stored = operator.read(&path).await.unwrap();
        let decoded = decode_replica_metadata(&stored.to_vec(), &metadata.replica_id).unwrap();
        assert_eq!(decoded.replica_id, metadata.replica_id);
        assert_eq!(decoded.app.build_number.as_deref(), Some("218"));
    }

    #[tokio::test]
    async fn should_return_false_when_metadata_upload_fails() {
        let root = tempfile::tempdir().unwrap();
        let operator = operator(root.path());
        let metadata = fixture().replica_metadata;
        let parent = root
            .path()
            .join(".myreader")
            .join("changes-v4")
            .join(&metadata.replica_id);
        std::fs::create_dir_all(parent.parent().unwrap()).unwrap();
        std::fs::write(&parent, b"not a directory").unwrap();

        assert!(!publish_replica_metadata(&operator, &metadata)
            .await
            .unwrap());
    }
}
