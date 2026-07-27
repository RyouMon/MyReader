use sea_orm::{
    sea_query::{Expr, ExprTrait, SimpleExpr},
    ActiveModelTrait, ColumnTrait, ConnectionTrait, DatabaseConnection, EntityTrait, QueryFilter,
    QueryOrder, Set,
};

use crate::error::AppError;
use myreader_core::entities::app::annotations;

pub struct SqliteAnnotationRepository;

fn next_updated_at(now: f64) -> SimpleExpr {
    let incremented = Expr::col(annotations::Column::UpdatedAt).add(1.0);
    Expr::case(incremented.clone().lt(now), now)
        .finally(incremented)
        .into()
}

impl SqliteAnnotationRepository {
    pub async fn open(library_path: &str) -> Result<DatabaseConnection, AppError> {
        myreader_core::database::open_db(library_path)
            .await
            .map_err(Into::into)
    }

    pub async fn list(
        db: &DatabaseConnection,
        book_id: i64,
        format: &str,
    ) -> Result<Vec<annotations::Model>, AppError> {
        annotations::Entity::find()
            .filter(annotations::Column::BookId.eq(book_id))
            .filter(annotations::Column::Format.eq(format))
            .filter(annotations::Column::DeletedAt.is_null())
            .order_by_asc(annotations::Column::CreatedAt)
            .all(db)
            .await
            .map_err(|error| AppError::Database(error.to_string()))
    }

    pub async fn find_by_id<C>(db: &C, id: &str) -> Result<Option<annotations::Model>, AppError>
    where
        C: ConnectionTrait,
    {
        annotations::Entity::find_by_id(id)
            .one(db)
            .await
            .map_err(|error| AppError::Database(error.to_string()))
    }

    #[allow(clippy::too_many_arguments)]
    pub async fn insert(
        db: &DatabaseConnection,
        id: &str,
        book_id: i64,
        format: &str,
        kind: &str,
        locator_json: &str,
        color: &str,
        note: Option<&str>,
        now: f64,
    ) -> Result<annotations::Model, AppError> {
        annotations::ActiveModel {
            id: Set(id.to_string()),
            book_id: Set(book_id),
            format: Set(format.to_string()),
            kind: Set(kind.to_string()),
            locator_json: Set(locator_json.to_string()),
            color: Set(color.to_string()),
            note: Set(note.map(ToString::to_string)),
            created_at: Set(now),
            updated_at: Set(now),
            deleted_at: Set(None),
        }
        .insert(db)
        .await
        .map_err(|error| AppError::Database(error.to_string()))
    }

    pub async fn update(
        db: &DatabaseConnection,
        id: &str,
        book_id: i64,
        format: &str,
        color: &str,
        note: Option<&str>,
        now: f64,
    ) -> Result<Option<annotations::Model>, AppError> {
        let rows = annotations::Entity::update_many()
            .col_expr(annotations::Column::Color, Expr::value(color.to_string()))
            .col_expr(
                annotations::Column::Note,
                Expr::value(note.map(ToString::to_string)),
            )
            .col_expr(annotations::Column::UpdatedAt, next_updated_at(now))
            .filter(annotations::Column::Id.eq(id))
            .filter(annotations::Column::BookId.eq(book_id))
            .filter(annotations::Column::Format.eq(format))
            .filter(annotations::Column::DeletedAt.is_null())
            .exec_with_returning(db)
            .await
            .map_err(|error| AppError::Database(error.to_string()))?;
        Ok(rows.into_iter().next())
    }

    pub async fn tombstone(
        db: &DatabaseConnection,
        id: &str,
        book_id: i64,
        format: &str,
        now: f64,
    ) -> Result<bool, AppError> {
        let next_updated_at = next_updated_at(now);
        let rows = annotations::Entity::update_many()
            .col_expr(annotations::Column::UpdatedAt, next_updated_at.clone())
            .col_expr(annotations::Column::DeletedAt, next_updated_at)
            .filter(annotations::Column::Id.eq(id))
            .filter(annotations::Column::BookId.eq(book_id))
            .filter(annotations::Column::Format.eq(format))
            .filter(annotations::Column::DeletedAt.is_null())
            .exec_with_returning(db)
            .await
            .map_err(|error| AppError::Database(error.to_string()))?;
        Ok(!rows.is_empty())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const LOCATOR: &str = r#"{"href":"chapter.xhtml","type":"application/xhtml+xml","text":{"highlight":"Selected text"}}"#;

    async fn open_temp() -> (tempfile::TempDir, DatabaseConnection) {
        let temp = tempfile::tempdir().unwrap();
        let db = SqliteAnnotationRepository::open(temp.path().to_string_lossy().as_ref())
            .await
            .unwrap();
        (temp, db)
    }

    #[tokio::test]
    async fn should_update_annotation_without_changing_its_locator() {
        let (_temp, db) = open_temp().await;
        let inserted = SqliteAnnotationRepository::insert(
            &db,
            "annotation-id",
            1,
            "EPUB",
            "highlight",
            LOCATOR,
            "yellow",
            None,
            100.0,
        )
        .await
        .unwrap();

        let updated = SqliteAnnotationRepository::update(
            &db,
            &inserted.id,
            1,
            "EPUB",
            "green",
            Some("A note"),
            50.0,
        )
        .await
        .unwrap()
        .unwrap();

        assert_eq!(updated.locator_json, LOCATOR);
        assert_eq!(updated.color, "green");
        assert_eq!(updated.note.as_deref(), Some("A note"));
        assert!(updated.updated_at > inserted.updated_at);
    }

    #[tokio::test]
    async fn should_hide_annotation_after_it_is_tombstoned() {
        let (_temp, db) = open_temp().await;
        SqliteAnnotationRepository::insert(
            &db,
            "annotation-id",
            1,
            "EPUB",
            "highlight",
            LOCATOR,
            "yellow",
            None,
            100.0,
        )
        .await
        .unwrap();

        assert!(
            SqliteAnnotationRepository::tombstone(&db, "annotation-id", 1, "EPUB", 200.0)
                .await
                .unwrap()
        );
        assert!(SqliteAnnotationRepository::list(&db, 1, "EPUB")
            .await
            .unwrap()
            .is_empty());
    }
}
