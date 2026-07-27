use sea_orm::{
    sea_query::{Alias, Condition, Expr, ExprTrait, Func, OnConflict},
    ColumnTrait, ConnectionTrait, DatabaseConnection, EntityTrait, QueryFilter, QueryOrder, Set,
};

use crate::error::AppError;
use myreader_core::entities::app::bookmarks;

pub struct SqliteBookmarkRepository;

fn excluded(column: bookmarks::Column) -> Expr {
    Expr::col((Alias::new("excluded"), column))
}

fn current(column: bookmarks::Column) -> Expr {
    Expr::col((bookmarks::Entity, column))
}

fn next_updated_at(candidate: Expr) -> Expr {
    Func::greatest([candidate, current(bookmarks::Column::UpdatedAt).add(1.0)]).into()
}

impl SqliteBookmarkRepository {
    pub async fn open(library_path: &str) -> Result<DatabaseConnection, AppError> {
        myreader_core::database::open_db(library_path)
            .await
            .map_err(Into::into)
    }

    pub async fn list(
        db: &DatabaseConnection,
        book_id: i64,
        format: &str,
    ) -> Result<Vec<bookmarks::Model>, AppError> {
        bookmarks::Entity::find()
            .filter(bookmarks::Column::BookId.eq(book_id))
            .filter(bookmarks::Column::Format.eq(format))
            .filter(bookmarks::Column::DeletedAt.is_null())
            .order_by_asc(bookmarks::Column::CreatedAt)
            .all(db)
            .await
            .map_err(|e| AppError::Database(e.to_string()))
    }

    pub async fn upsert(
        db: &DatabaseConnection,
        book_id: i64,
        format: &str,
        locator_key: &str,
        locator_json: &str,
        now: f64,
    ) -> Result<bookmarks::Model, AppError> {
        let active = bookmarks::ActiveModel {
            id: Set(uuid::Uuid::new_v4().as_simple().to_string()),
            book_id: Set(book_id),
            format: Set(format.to_string()),
            locator_key: Set(locator_key.to_string()),
            locator_json: Set(locator_json.to_string()),
            created_at: Set(now),
            updated_at: Set(now),
            deleted_at: Set(None),
        };
        bookmarks::Entity::insert(active)
            .on_conflict(
                OnConflict::columns([
                    bookmarks::Column::BookId,
                    bookmarks::Column::Format,
                    bookmarks::Column::LocatorKey,
                ])
                .update_column(bookmarks::Column::LocatorJson)
                .value(
                    bookmarks::Column::UpdatedAt,
                    next_updated_at(excluded(bookmarks::Column::UpdatedAt)),
                )
                .value(
                    bookmarks::Column::DeletedAt,
                    Expr::value(Option::<f64>::None),
                )
                .to_owned(),
            )
            .exec_with_returning(db)
            .await
            .map_err(|e| AppError::Database(e.to_string()))
    }

    pub async fn tombstone(
        db: &DatabaseConnection,
        book_id: i64,
        format: &str,
        locator_key: &str,
        now: f64,
    ) -> Result<bool, AppError> {
        let next_updated_at = next_updated_at(Expr::value(now));
        let is_active = current(bookmarks::Column::DeletedAt).is_null();
        let rows = bookmarks::Entity::update_many()
            .col_expr(
                bookmarks::Column::UpdatedAt,
                Expr::case(is_active.clone(), next_updated_at.clone())
                    .finally(current(bookmarks::Column::UpdatedAt))
                    .into(),
            )
            .col_expr(
                bookmarks::Column::DeletedAt,
                Expr::case(is_active, next_updated_at)
                    .finally(current(bookmarks::Column::DeletedAt))
                    .into(),
            )
            .filter(bookmarks::Column::BookId.eq(book_id))
            .filter(bookmarks::Column::Format.eq(format))
            .filter(bookmarks::Column::LocatorKey.eq(locator_key))
            .exec_with_returning(db)
            .await
            .map_err(|e| AppError::Database(e.to_string()))?;
        Ok(!rows.is_empty())
    }

    #[allow(clippy::too_many_arguments)]
    pub async fn apply_sync_revision(
        db: &DatabaseConnection,
        id: &str,
        book_id: i64,
        format: &str,
        locator_key: &str,
        locator_json: &str,
        created_at: f64,
        updated_at: f64,
        deleted_at: Option<f64>,
    ) -> Result<bool, AppError> {
        let excluded_updated_at = excluded(bookmarks::Column::UpdatedAt);
        let current_updated_at = current(bookmarks::Column::UpdatedAt);
        let excluded_deleted_at = excluded(bookmarks::Column::DeletedAt);
        let current_deleted_at = current(bookmarks::Column::DeletedAt);
        let excluded_id = excluded(bookmarks::Column::Id);
        let current_id = current(bookmarks::Column::Id);
        let excluded_locator = excluded(bookmarks::Column::LocatorJson);
        let current_locator = current(bookmarks::Column::LocatorJson);
        let excluded_created_at = excluded(bookmarks::Column::CreatedAt);
        let current_created_at = current(bookmarks::Column::CreatedAt);

        let same_deletion_state = Condition::any()
            .add(
                Condition::all()
                    .add(excluded_deleted_at.clone().is_null())
                    .add(current_deleted_at.clone().is_null()),
            )
            .add(
                Condition::all()
                    .add(excluded_deleted_at.clone().is_not_null())
                    .add(current_deleted_at.clone().is_not_null()),
            );
        let excluded_deleted_value: Expr =
            Func::coalesce([excluded_deleted_at.clone(), Expr::value(-1.0)]).into();
        let current_deleted_value: Expr =
            Func::coalesce([current_deleted_at.clone(), Expr::value(-1.0)]).into();
        let tuple_is_greater = Condition::any()
            .add(excluded_id.clone().gt(current_id.clone()))
            .add(
                Condition::all()
                    .add(excluded_id.clone().eq(current_id.clone()))
                    .add(excluded_locator.clone().gt(current_locator.clone())),
            )
            .add(
                Condition::all()
                    .add(excluded_id.clone().eq(current_id.clone()))
                    .add(excluded_locator.clone().eq(current_locator.clone()))
                    .add(excluded_created_at.clone().gt(current_created_at.clone())),
            )
            .add(
                Condition::all()
                    .add(excluded_id.eq(current_id))
                    .add(excluded_locator.eq(current_locator))
                    .add(excluded_created_at.eq(current_created_at))
                    .add(excluded_deleted_value.gt(current_deleted_value)),
            );
        // Equal timestamps converge on the greatest tuple:
        // [is_deleted, id, locator_json, created_at, deleted_at_or_-1].
        let revision_wins = Condition::any()
            .add(excluded_updated_at.clone().gt(current_updated_at.clone()))
            .add(
                Condition::all()
                    .add(excluded_updated_at.eq(current_updated_at))
                    .add(
                        Condition::any()
                            .add(
                                Condition::all()
                                    .add(excluded_deleted_at.is_not_null())
                                    .add(current_deleted_at.is_null()),
                            )
                            .add(
                                Condition::all()
                                    .add(same_deletion_state)
                                    .add(tuple_is_greater),
                            ),
                    ),
            );
        let active = bookmarks::ActiveModel {
            id: Set(id.to_string()),
            book_id: Set(book_id),
            format: Set(format.to_string()),
            locator_key: Set(locator_key.to_string()),
            locator_json: Set(locator_json.to_string()),
            created_at: Set(created_at),
            updated_at: Set(updated_at),
            deleted_at: Set(deleted_at),
        };
        let rows_affected = bookmarks::Entity::insert(active)
            .on_conflict(
                OnConflict::columns([
                    bookmarks::Column::BookId,
                    bookmarks::Column::Format,
                    bookmarks::Column::LocatorKey,
                ])
                .update_columns([
                    bookmarks::Column::Id,
                    bookmarks::Column::LocatorJson,
                    bookmarks::Column::CreatedAt,
                    bookmarks::Column::UpdatedAt,
                    bookmarks::Column::DeletedAt,
                ])
                .action_cond_where(revision_wins)
                .to_owned(),
            )
            .exec_without_returning(db)
            .await
            .map_err(|e| AppError::Database(e.to_string()))?;

        Ok(rows_affected > 0)
    }

    pub async fn find_state<C>(
        db: &C,
        book_id: i64,
        format: &str,
        locator_key: &str,
    ) -> Result<Option<bookmarks::Model>, AppError>
    where
        C: ConnectionTrait,
    {
        bookmarks::Entity::find()
            .filter(bookmarks::Column::BookId.eq(book_id))
            .filter(bookmarks::Column::Format.eq(format))
            .filter(bookmarks::Column::LocatorKey.eq(locator_key))
            .one(db)
            .await
            .map_err(|error| AppError::Database(error.to_string()))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const REMOTE_LOCATOR: &str = r#"{"href":"remote.xhtml","type":"application/xhtml+xml"}"#;
    const LOCAL_LOCATOR: &str = r#"{"href":"local.xhtml","type":"application/xhtml+xml"}"#;

    async fn open_temp() -> (tempfile::TempDir, DatabaseConnection) {
        let temp = tempfile::tempdir().unwrap();
        let db = SqliteBookmarkRepository::open(temp.path().to_string_lossy().as_ref())
            .await
            .unwrap();
        (temp, db)
    }

    #[tokio::test]
    async fn local_upsert_should_advance_from_current_row_when_remote_revision_is_newer() {
        let (_temp, db) = open_temp().await;
        SqliteBookmarkRepository::apply_sync_revision(
            &db,
            "remote-id",
            1,
            "EPUB",
            "chapter",
            REMOTE_LOCATOR,
            50.0,
            500.0,
            Some(500.0),
        )
        .await
        .unwrap();

        let revived =
            SqliteBookmarkRepository::upsert(&db, 1, "EPUB", "chapter", LOCAL_LOCATOR, 100.0)
                .await
                .unwrap();

        assert_eq!(revived.id, "remote-id");
        assert_eq!(revived.locator_json, LOCAL_LOCATOR);
        assert_eq!(revived.updated_at, 501.0);
        assert_eq!(revived.deleted_at, None);
    }

    #[tokio::test]
    async fn local_tombstone_should_advance_once_from_current_row_when_remote_revision_is_newer() {
        let (_temp, db) = open_temp().await;
        SqliteBookmarkRepository::apply_sync_revision(
            &db,
            "remote-id",
            1,
            "EPUB",
            "chapter",
            REMOTE_LOCATOR,
            50.0,
            500.0,
            None,
        )
        .await
        .unwrap();

        assert!(
            SqliteBookmarkRepository::tombstone(&db, 1, "EPUB", "chapter", 100.0)
                .await
                .unwrap()
        );
        assert!(
            SqliteBookmarkRepository::tombstone(&db, 1, "EPUB", "chapter", 900.0)
                .await
                .unwrap()
        );

        let model = bookmarks::Entity::find_by_id("remote-id")
            .one(&db)
            .await
            .unwrap()
            .unwrap();
        assert_eq!(model.updated_at, 501.0);
        assert_eq!(model.deleted_at, Some(501.0));
    }

    #[tokio::test]
    async fn local_and_remote_upserts_should_linearize_without_timestamp_regression() {
        let (_temp, db) = open_temp().await;
        let local =
            SqliteBookmarkRepository::upsert(&db, 1, "EPUB", "chapter", LOCAL_LOCATOR, 100.0);
        let remote = SqliteBookmarkRepository::apply_sync_revision(
            &db,
            "remote-id",
            1,
            "EPUB",
            "chapter",
            REMOTE_LOCATOR,
            50.0,
            1_000.0,
            None,
        );

        let (local_result, remote_result) = tokio::join!(local, remote);
        local_result.unwrap();
        remote_result.unwrap();
        let model = bookmarks::Entity::find()
            .filter(bookmarks::Column::BookId.eq(1))
            .one(&db)
            .await
            .unwrap()
            .unwrap();
        assert!(model.updated_at >= 1_000.0);
        assert!(model.locator_json == REMOTE_LOCATOR || model.locator_json == LOCAL_LOCATOR);
    }
}
