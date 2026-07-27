use std::collections::HashMap;

use sea_orm::{
    sea_query::{Alias, Condition, Expr, ExprTrait, Func, OnConflict},
    ColumnTrait, ConnectionTrait, DatabaseConnection, EntityTrait, QueryFilter, Set,
};

use crate::entities::app::reading_progress;
use crate::error::AppError;
use crate::models::ReadingProgressDto;

pub struct SqliteProgressRepository;

fn excluded(column: reading_progress::Column) -> Expr {
    Expr::col((Alias::new("excluded"), column))
}

fn current(column: reading_progress::Column) -> Expr {
    Expr::col((reading_progress::Entity, column))
}

impl SqliteProgressRepository {
    pub async fn open(library_path: &str) -> Result<DatabaseConnection, AppError> {
        crate::db::open_db(library_path).await
    }

    pub async fn get_progress(
        db: &DatabaseConnection,
        library_id: &str,
        book_id: i64,
        format: &str,
    ) -> Result<Option<ReadingProgressDto>, AppError> {
        let model = reading_progress::Entity::find()
            .filter(reading_progress::Column::BookId.eq(book_id))
            .filter(reading_progress::Column::Format.eq(format))
            .one(db)
            .await
            .map_err(|e| AppError::Database(e.to_string()))?;

        match model {
            Some(m) => {
                let locator: serde_json::Value = serde_json::from_str(&m.locator_json)
                    .map_err(|e| AppError::Serialize(e.to_string()))?;
                Ok(Some(ReadingProgressDto {
                    library_id: library_id.to_string(),
                    book_id: m.book_id,
                    format: m.format,
                    locator,
                    display_progression: m.display_progression,
                    updated_at: m.updated_at,
                }))
            }
            None => Ok(None),
        }
    }

    pub async fn list_all_progress(
        db: &DatabaseConnection,
        library_id: &str,
    ) -> Result<Vec<ReadingProgressDto>, AppError> {
        let rows = reading_progress::Entity::find()
            .all(db)
            .await
            .map_err(|e| AppError::Database(e.to_string()))?;

        rows.into_iter()
            .map(|m| {
                let locator: serde_json::Value = serde_json::from_str(&m.locator_json)
                    .map_err(|e| AppError::Serialize(e.to_string()))?;
                Ok(ReadingProgressDto {
                    library_id: library_id.to_string(),
                    book_id: m.book_id,
                    format: m.format,
                    locator,
                    display_progression: m.display_progression,
                    updated_at: m.updated_at,
                })
            })
            .collect()
    }

    pub async fn set_progress(
        db: &DatabaseConnection,
        book_id: i64,
        format: &str,
        locator_json: &str,
        display_progression: Option<f64>,
        updated_at: f64,
    ) -> Result<(), AppError> {
        let next_updated_at: Expr = Func::greatest([
            excluded(reading_progress::Column::UpdatedAt),
            current(reading_progress::Column::UpdatedAt).add(1.0),
        ])
        .into();
        let active = reading_progress::ActiveModel {
            id: Set(uuid::Uuid::new_v4().as_simple().to_string()),
            book_id: Set(book_id),
            format: Set(format.to_string()),
            locator_json: Set(locator_json.to_string()),
            updated_at: Set(updated_at),
            display_progression: Set(display_progression),
            sync_conflict_count: Set(0),
        };
        reading_progress::Entity::insert(active)
            .on_conflict(
                OnConflict::columns([
                    reading_progress::Column::BookId,
                    reading_progress::Column::Format,
                ])
                .update_column(reading_progress::Column::LocatorJson)
                .update_column(reading_progress::Column::DisplayProgression)
                .value(reading_progress::Column::UpdatedAt, next_updated_at)
                .to_owned(),
            )
            .exec_without_returning(db)
            .await
            .map_err(|e| AppError::Database(e.to_string()))?;
        Ok(())
    }

    pub async fn apply_sync_revision(
        db: &DatabaseConnection,
        book_id: i64,
        format: &str,
        locator_json: &str,
        display_progression: Option<f64>,
        updated_at: f64,
    ) -> Result<bool, AppError> {
        let excluded_updated_at = excluded(reading_progress::Column::UpdatedAt);
        let current_updated_at = current(reading_progress::Column::UpdatedAt);
        let excluded_locator = excluded(reading_progress::Column::LocatorJson);
        let current_locator = current(reading_progress::Column::LocatorJson);
        let excluded_display_progression: Expr = Func::coalesce([
            excluded(reading_progress::Column::DisplayProgression),
            Expr::value(-1.0),
        ])
        .into();
        let current_display_progression: Expr = Func::coalesce([
            current(reading_progress::Column::DisplayProgression),
            Expr::value(-1.0),
        ])
        .into();
        let revision_wins = Condition::any()
            .add(excluded_updated_at.clone().gt(current_updated_at.clone()))
            .add(
                Condition::all()
                    .add(excluded_updated_at.eq(current_updated_at))
                    .add(
                        Condition::any()
                            .add(excluded_locator.clone().gt(current_locator.clone()))
                            .add(
                                Condition::all()
                                    .add(excluded_locator.eq(current_locator))
                                    .add(
                                        excluded_display_progression
                                            .gt(current_display_progression),
                                    ),
                            ),
                    ),
            );
        let active = reading_progress::ActiveModel {
            id: Set(uuid::Uuid::new_v4().as_simple().to_string()),
            book_id: Set(book_id),
            format: Set(format.to_string()),
            locator_json: Set(locator_json.to_string()),
            updated_at: Set(updated_at),
            display_progression: Set(display_progression),
            sync_conflict_count: Set(0),
        };
        let rows_affected = reading_progress::Entity::insert(active)
            .on_conflict(
                OnConflict::columns([
                    reading_progress::Column::BookId,
                    reading_progress::Column::Format,
                ])
                .update_columns([
                    reading_progress::Column::LocatorJson,
                    reading_progress::Column::DisplayProgression,
                    reading_progress::Column::UpdatedAt,
                ])
                .action_cond_where(revision_wins)
                .to_owned(),
            )
            .exec_without_returning(db)
            .await
            .map_err(|e| AppError::Database(e.to_string()))?;

        Ok(rows_affected > 0)
    }

    pub async fn find_position_state<C>(
        db: &C,
        book_id: i64,
        format: &str,
    ) -> Result<Option<reading_progress::Model>, AppError>
    where
        C: ConnectionTrait,
    {
        reading_progress::Entity::find()
            .filter(reading_progress::Column::BookId.eq(book_id))
            .filter(reading_progress::Column::Format.eq(format))
            .one(db)
            .await
            .map_err(|error| AppError::Database(error.to_string()))
    }
    pub async fn list_latest_book_updates(
        db: &DatabaseConnection,
    ) -> Result<HashMap<i64, f64>, AppError> {
        let rows = reading_progress::Entity::find()
            .all(db)
            .await
            .map_err(|e| AppError::Database(e.to_string()))?;

        let mut latest = HashMap::new();
        for row in rows {
            latest
                .entry(row.book_id)
                .and_modify(|updated_at: &mut f64| {
                    if row.updated_at > *updated_at {
                        *updated_at = row.updated_at;
                    }
                })
                .or_insert(row.updated_at);
        }
        Ok(latest)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const REMOTE_LOCATOR: &str = r#"{"href":"remote.xhtml"}"#;
    const LOCAL_LOCATOR: &str = r#"{"href":"local.xhtml"}"#;

    async fn open_temp() -> (tempfile::TempDir, DatabaseConnection) {
        let temp = tempfile::tempdir().unwrap();
        let db = SqliteProgressRepository::open(temp.path().to_string_lossy().as_ref())
            .await
            .unwrap();
        (temp, db)
    }

    #[tokio::test]
    async fn local_set_should_advance_from_current_row_when_remote_revision_is_newer() {
        let (_temp, db) = open_temp().await;
        SqliteProgressRepository::apply_sync_revision(&db, 1, "EPUB", REMOTE_LOCATOR, None, 300.0)
            .await
            .unwrap();

        SqliteProgressRepository::set_progress(&db, 1, "EPUB", LOCAL_LOCATOR, None, 200.0)
            .await
            .unwrap();

        let model = reading_progress::Entity::find()
            .filter(reading_progress::Column::BookId.eq(1))
            .one(&db)
            .await
            .unwrap()
            .unwrap();
        assert_eq!(model.locator_json, LOCAL_LOCATOR);
        assert_eq!(model.updated_at, 301.0);
    }

    #[tokio::test]
    async fn local_and_remote_sets_should_linearize_without_timestamp_regression() {
        let (_temp, db) = open_temp().await;
        let local =
            SqliteProgressRepository::set_progress(&db, 1, "EPUB", LOCAL_LOCATOR, None, 200.0);
        let remote = SqliteProgressRepository::apply_sync_revision(
            &db,
            1,
            "EPUB",
            REMOTE_LOCATOR,
            None,
            300.0,
        );

        let (local_result, remote_result) = tokio::join!(local, remote);
        local_result.unwrap();
        remote_result.unwrap();
        let model = reading_progress::Entity::find()
            .filter(reading_progress::Column::BookId.eq(1))
            .one(&db)
            .await
            .unwrap()
            .unwrap();
        assert!(model.updated_at >= 300.0);
        assert!(model.locator_json == REMOTE_LOCATOR || model.locator_json == LOCAL_LOCATOR);
    }
}
