use automerge::AutoCommit;
use sea_orm::DatabaseTransaction;

use crate::error::AppError;
use crate::repositories::{
    annotation_repo::SqliteAnnotationRepository, bookmark_repo::SqliteBookmarkRepository,
    favorite_book_repo::SqliteFavoriteBookRepository, progress_repo::SqliteProgressRepository,
    reading_statistics_repo::SqliteReadingStatisticsRepository,
};

use super::automerge_document::{
    annotation_projections, bookmark_projections, favorite_projections,
    reading_completion_projections, reading_position_projections, reading_session_projections,
};
use super::automerge_store::AutomergeProjection;

pub struct LibrarySidecarAutomergeProjection;

#[async_trait::async_trait]
impl AutomergeProjection for LibrarySidecarAutomergeProjection {
    async fn apply(
        &self,
        txn: &DatabaseTransaction,
        document: &AutoCommit,
        _heads_json: &str,
    ) -> Result<(), AppError> {
        for projection in reading_position_projections(document)? {
            SqliteProgressRepository::write_automerge_projection(
                txn,
                projection.book_id,
                &projection.value.format,
                &projection.value.locator_json,
                projection
                    .value
                    .display_progression_ppm
                    .map(|value| f64::from(value) / 1_000_000.0),
                projection.value.recorded_at as f64,
                i64::try_from(projection.conflict_count)
                    .map_err(|_| AppError::Sync("Too many reading position conflicts".into()))?,
            )
            .await?;
        }
        for (book_id, favorite) in favorite_projections(document)? {
            SqliteFavoriteBookRepository::write_automerge_projection(
                txn,
                book_id,
                favorite.added_at.unwrap_or(favorite.recorded_at) as f64,
                favorite.is_favorite,
            )
            .await?;
        }
        for bookmark in bookmark_projections(document)? {
            SqliteBookmarkRepository::write_automerge_projection(
                txn,
                &bookmark.id,
                bookmark.book_id,
                &bookmark.format,
                &bookmark.locator_key,
                &bookmark.locator_json,
                bookmark.created_at as f64,
                bookmark.recorded_at as f64,
                bookmark.deleted_at.map(|value| value as f64),
            )
            .await?;
        }
        for annotation in annotation_projections(document)? {
            SqliteAnnotationRepository::write_automerge_projection(
                txn,
                &annotation.id,
                annotation.book_id,
                &annotation.format,
                &annotation.kind,
                &annotation.locator_json,
                &annotation.color,
                annotation.note.as_deref(),
                annotation.created_at as f64,
                annotation.updated_at as f64,
                annotation.deleted_at.map(|value| value as f64),
            )
            .await?;
        }
        for session in reading_session_projections(document)? {
            SqliteReadingStatisticsRepository::write_session_projection(
                txn,
                &session.id,
                session.book_id,
                &session.format,
                &session.local_day,
                session.started_at as f64,
                session.duration_seconds,
                session.updated_at as f64,
            )
            .await?;
        }
        for completion in reading_completion_projections(document)? {
            SqliteReadingStatisticsRepository::write_completion_projection(
                txn,
                &completion.id,
                completion.book_id,
                &completion.format,
                &completion.local_day,
                completion.completed_at as f64,
                completion.updated_at as f64,
            )
            .await?;
        }
        Ok(())
    }
}
