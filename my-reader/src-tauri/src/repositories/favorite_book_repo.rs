use sea_orm::{
    ActiveModelTrait, ColumnTrait, ConnectionTrait, DatabaseConnection, EntityTrait, QueryFilter,
    QueryOrder, Set,
};

use crate::entities::app::favorite_books;
use crate::error::AppError;

pub struct SqliteFavoriteBookRepository;

impl SqliteFavoriteBookRepository {
    pub async fn open(sidecar_root: &str) -> Result<DatabaseConnection, AppError> {
        crate::db::open_db(sidecar_root).await
    }

    pub async fn list_book_ids(db: &DatabaseConnection) -> Result<Vec<i64>, AppError> {
        let rows = favorite_books::Entity::find()
            .filter(favorite_books::Column::IsFavorite.eq(1))
            .order_by_asc(favorite_books::Column::AddedAt)
            .all(db)
            .await
            .map_err(|e| AppError::Database(e.to_string()))?;

        Ok(rows.into_iter().map(|row| row.book_id).collect())
    }

    pub async fn find_by_book_id<C>(
        db: &C,
        book_id: i64,
    ) -> Result<Option<favorite_books::Model>, AppError>
    where
        C: ConnectionTrait,
    {
        favorite_books::Entity::find()
            .filter(favorite_books::Column::BookId.eq(book_id))
            .one(db)
            .await
            .map_err(|error| AppError::Database(error.to_string()))
    }

    pub async fn write_automerge_projection<C>(
        db: &C,
        book_id: i64,
        added_at: f64,
        is_favorite: bool,
    ) -> Result<(), AppError>
    where
        C: ConnectionTrait,
    {
        if let Some(model) = Self::find_by_book_id(db, book_id).await? {
            let mut active: favorite_books::ActiveModel = model.into();
            active.added_at = Set(added_at);
            active.is_favorite = Set(i64::from(is_favorite));
            active
                .update(db)
                .await
                .map_err(|error| AppError::Database(error.to_string()))?;
        } else {
            favorite_books::ActiveModel {
                id: Set(uuid::Uuid::new_v4().as_simple().to_string()),
                book_id: Set(book_id),
                added_at: Set(added_at),
                is_favorite: Set(i64::from(is_favorite)),
            }
            .insert(db)
            .await
            .map_err(|error| AppError::Database(error.to_string()))?;
        }
        Ok(())
    }
}
