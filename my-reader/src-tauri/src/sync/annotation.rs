use sea_orm::DatabaseConnection;
use uuid::Uuid;

use crate::entities::app::annotations;
use crate::error::AppError;
use crate::repositories::annotation_repo::SqliteAnnotationRepository;

use super::automerge_document::{
    annotation_projections, create_annotation, delete_annotation, update_annotation,
    AnnotationValue,
};
use super::automerge_projection::LibrarySidecarAutomergeProjection;
use super::automerge_store::commit_library_sidecar_automerge_mutation;
use super::replica_identity::ensure_replica_identity;

#[allow(clippy::too_many_arguments)]
pub async fn add_local_annotation(
    db: &DatabaseConnection,
    library_uuid: &str,
    book_id: i64,
    format: &str,
    locator_json: &str,
    color: &str,
    note: Option<&str>,
    now_ms: u64,
) -> Result<annotations::Model, AppError> {
    let identity = ensure_replica_identity(db, library_uuid).await?;
    let id = Uuid::new_v4().as_simple().to_string();
    let projection = LibrarySidecarAutomergeProjection;
    commit_library_sidecar_automerge_mutation(
        db,
        &identity,
        now_ms,
        |document| {
            create_annotation(
                document,
                &AnnotationValue {
                    id: id.clone(),
                    book_id,
                    format: format.to_owned(),
                    kind: "highlight".to_owned(),
                    locator_json: locator_json.to_owned(),
                    created_at: now_ms as i64,
                    color: color.to_owned(),
                    note: note.map(ToOwned::to_owned),
                    updated_at: now_ms as i64,
                    deleted: false,
                    deleted_at: None,
                },
            )?;
            Ok(())
        },
        Some(&projection),
    )
    .await?;
    SqliteAnnotationRepository::find_by_id(db, &id)
        .await?
        .ok_or_else(|| AppError::Database("Annotation creation returned no row".into()))
}

#[allow(clippy::too_many_arguments)]
pub async fn update_local_annotation(
    db: &DatabaseConnection,
    library_uuid: &str,
    id: &str,
    book_id: i64,
    format: &str,
    color: &str,
    note: Option<&str>,
    now_ms: u64,
) -> Result<Option<annotations::Model>, AppError> {
    let identity = ensure_replica_identity(db, library_uuid).await?;
    let projection = LibrarySidecarAutomergeProjection;
    let mut exists = true;
    commit_library_sidecar_automerge_mutation(
        db,
        &identity,
        now_ms,
        |document| {
            let current = annotation_projections(document)?
                .into_iter()
                .find(|annotation| {
                    annotation.id == id
                        && annotation.book_id == book_id
                        && annotation.format == format
                        && !annotation.deleted
                });
            if current.is_none() {
                exists = false;
                return Ok(());
            }
            update_annotation(document, id, color, note, now_ms as i64)?;
            Ok(())
        },
        Some(&projection),
    )
    .await?;
    if exists {
        SqliteAnnotationRepository::find_by_id(db, id).await
    } else {
        Ok(None)
    }
}

pub async fn delete_local_annotation(
    db: &DatabaseConnection,
    library_uuid: &str,
    id: &str,
    book_id: i64,
    format: &str,
    now_ms: u64,
) -> Result<bool, AppError> {
    let identity = ensure_replica_identity(db, library_uuid).await?;
    let projection = LibrarySidecarAutomergeProjection;
    let mut exists = true;
    commit_library_sidecar_automerge_mutation(
        db,
        &identity,
        now_ms,
        |document| {
            let current = annotation_projections(document)?
                .into_iter()
                .find(|annotation| {
                    annotation.id == id
                        && annotation.book_id == book_id
                        && annotation.format == format
                        && !annotation.deleted
                });
            if current.is_none() {
                exists = false;
                return Ok(());
            }
            delete_annotation(document, id, now_ms as i64)?;
            Ok(())
        },
        Some(&projection),
    )
    .await?;
    Ok(exists)
}
