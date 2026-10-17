use super::*;

struct RemoteDocument {
    bytes: Vec<u8>,
    heads: Vec<String>,
    paths: String,
    repair: Option<RemoteStorageRepair>,
    reading_positions: Vec<crate::models::SyncedReadingPosition>,
}

fn remote_document(
    identity: &DatabaseIdentity,
    objects: &[SyncRemoteObject],
) -> Result<RemoteDocument, SyncError> {
    use crate::sync::document::{
        apply_library_sidecar_incremental, library_sidecar_heads,
        library_sidecar_missing_dependencies, load_library_sidecar_document,
        validate_library_identity,
    };
    validate_remote_objects(objects)?;
    let mut document = load_library_sidecar_document(identity.replica_id.as_str())?;
    for object in objects {
        apply_library_sidecar_incremental(&mut document, &object.bytes)
            .and_then(|_| validate_library_identity(&document, identity.library_uuid.as_str()))
            .map_err(|error| SyncError::InvalidRemoteObject {
                object_path: display_storage_key(&object.storage_key),
                reason: error.to_string(),
            })?;
    }
    let paths = objects
        .iter()
        .map(|o| display_storage_key(&o.storage_key))
        .collect::<Vec<_>>()
        .join(",");
    let missing = library_sidecar_missing_dependencies(&mut document, &[]);
    let mut reading_positions = Vec::new();
    if missing.is_empty() && !objects.is_empty() {
        for projection in crate::sync::document::reading_position_projections(&document)? {
            for candidate in crate::sync::document::reading_position_candidates(
                &document,
                projection.book_id,
                &projection.value.format,
            )? {
                if candidate.value.replica_id == identity.replica_id.as_str() {
                    continue;
                }
                reading_positions.push(crate::models::SyncedReadingPosition {
                    book_id: projection.book_id,
                    format: candidate.value.format,
                    operation_id: candidate.operation_id,
                    locator: serde_json::from_str(&candidate.value.locator_json)
                        .map_err(|error| sync_error(error.to_string()))?,
                    recorded_at: candidate.value.recorded_at,
                });
            }
        }
    }
    Ok(RemoteDocument {
        reading_positions,
        bytes: objects
            .iter()
            .flat_map(|o| o.bytes.iter().copied())
            .collect(),
        heads: library_sidecar_heads(&mut document),
        repair: (!missing.is_empty()).then(|| RemoteStorageRepair {
            change_hashes: missing.join(","),
            object_paths: paths.clone(),
        }),
        paths,
    })
}

// The comparison includes bytes: a same-head replacement must not let a stale
// computation overwrite a repaired snapshot. No Automerge work runs at commit.
pub(super) fn snapshot_token(
    connection: &Connection,
) -> Result<Option<(i64, Vec<u8>, String)>, SyncError> {
    connection.query_row(
        "SELECT schema_version, snapshot_bytes, heads_json FROM sync_automerge_state WHERE id = 'local'",
        [], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
    ).optional().map_err(database_error)
}

pub fn apply_remote_database_objects(
    database_path: &str,
    identity: &DatabaseIdentity,
    now_ms: i64,
    objects: Vec<SyncRemoteObject>,
) -> Result<ApplyRemoteDatabaseResult, SyncError> {
    let remote = remote_document(identity, &objects)?;
    apply_prepared(
        database_path,
        identity,
        now_ms,
        remote,
        objects.is_empty(),
        || {},
    )
}

fn apply_prepared(
    database_path: &str,
    identity: &DatabaseIdentity,
    now_ms: i64,
    remote: RemoteDocument,
    inspect_only: bool,
    mut before_commit: impl FnMut(),
) -> Result<ApplyRemoteDatabaseResult, SyncError> {
    let mut connection = open_connection(database_path)?;
    loop {
        let transaction = connection
            .transaction_with_behavior(TransactionBehavior::Deferred)
            .map_err(database_error)?;
        let token = snapshot_token(&transaction)?;
        let projection_mode = token
            .as_ref()
            .map(|(_, _, heads)| {
                let heads: Vec<String> =
                    serde_json::from_str(heads).map_err(|error| sync_error(error.to_string()))?;
                update_projection_mode(&transaction, &heads)
            })
            .transpose()?;
        transaction.commit().map_err(database_error)?;
        let current = decode_state(token.clone(), identity)?;
        let Some(mut current) = current else {
            // First use creates only the small genesis document. Recheck under
            // the write lock so a concurrent first local write is never lost.
            let transaction = connection
                .transaction_with_behavior(TransactionBehavior::Immediate)
                .map_err(database_error)?;
            if snapshot_token(&transaction)?.is_none() {
                initialize(&transaction, identity, now_ms)?;
            }
            transaction.commit().map_err(database_error)?;
            continue;
        };
        let document = take_document(&mut current, identity)?;
        let result = execute_loaded_document_command(
            document,
            request(
                identity,
                current.heads,
                if inspect_only {
                    DocumentCommand::Inspect
                } else {
                    DocumentCommand::ApplyIncremental
                },
            ),
            (!inspect_only).then_some(remote.bytes.as_slice()),
            if current.migration.is_some() {
                ProjectionMode::Full
            } else {
                projection_mode.unwrap_or(ProjectionMode::Full)
            },
        )?;
        if !result.missing_dependencies.is_empty() {
            return Err(SyncError::MissingDependencies {
                change_hashes: result.missing_dependencies.join(","),
                object_paths: remote.paths,
            });
        }
        let local_delta = if inspect_only {
            None
        } else {
            Some(execute_document_command_projected(
                Some(&result.snapshot_bytes),
                request(identity, remote.heads.clone(), DocumentCommand::Inspect),
                None,
                ProjectionMode::None,
            )?)
        };
        before_commit();
        let transaction = connection
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .map_err(database_error)?;
        if snapshot_token(&transaction)? != token {
            // Local edits win admission. Recompute against the new snapshot;
            // never replace their state, projection, or outbox with stale data.
            transaction.rollback().map_err(database_error)?;
            continue;
        }
        if let Some(migration) = current.migration.as_ref() {
            persist_local_result(&transaction, identity, migration, now_ms, Some(now_ms))?;
        }
        if let Some(delta) = local_delta.as_ref() {
            persist_remote_result(&transaction, identity, &result, delta, now_ms)?;
        } else {
            rebuild_projection(&transaction, &result, now_ms)?;
        }
        transaction.commit().map_err(database_error)?;
        return Ok(ApplyRemoteDatabaseResult {
            applied_objects: result.changes.len(),
            reading_positions: remote.reading_positions,
            document: result,
            remote_storage_repair: remote.repair,
        });
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::sync::tests::persistence_contract::create_database;

    #[test]
    fn local_write_commits_during_remote_computation_and_survives_retry() {
        let (_dir, path) = create_database();
        let identity =
            ensure_database_identity(&path, "11111111-2222-4333-8444-555555555555").unwrap();
        ensure_database_document(&path, &identity, 1).unwrap();
        let (_remote_dir, remote_path) = create_database();
        let remote_identity =
            ensure_database_identity(&remote_path, identity.library_uuid.as_str()).unwrap();
        execute_local_database_command(
            &remote_path,
            &remote_identity,
            1,
            SyncDatabaseCommand {
                command: DocumentCommand::SetFavorite {
                    book_id: 7,
                    value: crate::sync::document::FavoriteValue {
                        is_favorite: true,
                        added_at: Some(1),
                        recorded_at: 1,
                        replica_id: remote_identity.replica_id.to_string(),
                    },
                },
            },
        )
        .unwrap();
        let objects: Vec<_> = list_pending_outbox(&remote_path)
            .unwrap()
            .into_iter()
            .map(|entry| SyncRemoteObject {
                storage_key: entry.storage_key,
                bytes: entry.bytes,
                sha256: entry.sha256,
            })
            .collect();
        let remote = remote_document(&identity, &objects).unwrap();
        let mut attempts = 0;
        let result = apply_prepared(&path, &identity, 3, remote, false, || {
            attempts += 1;
            if attempts == 1 {
                // This synchronous write would time out if background decoding
                // retained even a SQLite read transaction (non-WAL fixture).
                execute_local_database_command(
                    &path,
                    &identity,
                    2,
                    SyncDatabaseCommand {
                        command: DocumentCommand::SetFavorite {
                            book_id: 42,
                            value: crate::sync::document::FavoriteValue {
                                is_favorite: true,
                                added_at: Some(2),
                                recorded_at: 2,
                                replica_id: identity.replica_id.to_string(),
                            },
                        },
                    },
                )
                .unwrap();
            }
        })
        .unwrap();
        assert_eq!(attempts, 2);
        assert!(!result.document.snapshot_bytes.is_empty());
        let connection = Connection::open(&path).unwrap();
        assert_eq!(
            connection
                .query_row(
                    "SELECT is_favorite FROM favorite_books WHERE book_id = 42",
                    [],
                    |r| r.get::<_, i64>(0)
                )
                .unwrap(),
            1
        );
        assert_eq!(
            connection
                .query_row(
                    "SELECT is_favorite FROM favorite_books WHERE book_id = 7",
                    [],
                    |r| r.get::<_, i64>(0)
                )
                .unwrap(),
            1
        );
        assert!(!list_pending_outbox(&path).unwrap().is_empty());
    }
}
