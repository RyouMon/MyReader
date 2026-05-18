use sea_orm::{ActiveModelTrait, ColumnTrait, DatabaseConnection, EntityTrait, QueryFilter, Set};
use serde::Serialize;
use specta::Type;

use crate::entities::file_state;
use crate::error::AppError;

#[derive(Debug, Clone, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct FileStateRow {
    pub path: String,
    pub local_state: String,
    pub local_blake3: Option<String>,
    pub local_size: Option<i64>,
    pub local_mtime: Option<i64>,
}

fn model_to_row(m: file_state::Model) -> FileStateRow {
    FileStateRow {
        path: m.path,
        local_state: m.local_state,
        local_blake3: m.local_blake3,
        local_size: m.local_size,
        local_mtime: m.local_mtime,
    }
}

pub async fn upsert(
    db: &DatabaseConnection,
    path: &str,
    local_state: &str,
    local_blake3: Option<&str>,
    local_size: Option<i64>,
    local_mtime: Option<i64>,
) -> Result<(), AppError> {
    let existing = file_state::Entity::find()
        .filter(file_state::Column::Path.eq(path))
        .one(db)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?;

    if let Some(model) = existing {
        let mut active: file_state::ActiveModel = model.into();
        active.local_state = Set(local_state.to_string());
        active.local_blake3 = Set(local_blake3.map(|s| s.to_string()));
        active.local_size = Set(local_size);
        active.local_mtime = Set(local_mtime);
        active.updated_at = Set(
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs_f64(),
        );
        active.update(db).await.map_err(|e| AppError::Database(e.to_string()))?;
    } else {
        let id = uuid::Uuid::new_v4().as_simple().to_string();
        let active = file_state::ActiveModel {
            id: Set(id),
            path: Set(path.to_string()),
            local_state: Set(local_state.to_string()),
            local_blake3: Set(local_blake3.map(|s| s.to_string())),
            local_size: Set(local_size),
            local_mtime: Set(local_mtime),
            updated_at: Set(
                std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap_or_default()
                    .as_secs_f64(),
            ),
        };
        active.insert(db).await.map_err(|e| AppError::Database(e.to_string()))?;
    }
    Ok(())
}

pub async fn get(db: &DatabaseConnection, path: &str) -> Result<Option<FileStateRow>, AppError> {
    let model = file_state::Entity::find()
        .filter(file_state::Column::Path.eq(path))
        .one(db)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?;
    Ok(model.map(model_to_row))
}

pub async fn list_all(db: &DatabaseConnection) -> Result<Vec<FileStateRow>, AppError> {
    let models = file_state::Entity::find()
        .all(db)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?;
    Ok(models.into_iter().map(model_to_row).collect())
}

pub async fn list_by_state(
    db: &DatabaseConnection,
    state: &str,
) -> Result<Vec<FileStateRow>, AppError> {
    let models = file_state::Entity::find()
        .filter(file_state::Column::LocalState.eq(state))
        .all(db)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?;
    Ok(models.into_iter().map(model_to_row).collect())
}

pub async fn delete(db: &DatabaseConnection, path: &str) -> Result<(), AppError> {
    let model = file_state::Entity::find()
        .filter(file_state::Column::Path.eq(path))
        .one(db)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?;

    if let Some(m) = model {
        file_state::Entity::delete_by_id(m.id)
            .exec(db)
            .await
            .map_err(|e| AppError::Database(e.to_string()))?;
    }
    Ok(())
}

pub async fn clear(db: &DatabaseConnection) -> Result<(), AppError> {
    file_state::Entity::delete_many()
        .exec(db)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?;
    Ok(())
}