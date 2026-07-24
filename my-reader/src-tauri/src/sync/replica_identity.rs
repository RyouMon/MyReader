use sea_orm::{ActiveModelTrait, DatabaseConnection, EntityTrait, Set, TransactionTrait};
use uuid::{Uuid, Variant, Version};

use crate::entities::app::sync_local_meta;
use crate::error::AppError;

const PROTOCOL: &str = "library-sidecar-automerge";

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ReplicaIdentity {
    pub library_uuid: String,
    pub replica_id: String,
}

fn database_error(error: sea_orm::DbErr) -> AppError {
    AppError::Database(error.to_string())
}

fn sync_error(message: impl Into<String>) -> AppError {
    AppError::Sync(message.into())
}

fn parse_library_uuid(value: &str) -> Result<Uuid, AppError> {
    let uuid = Uuid::parse_str(value).map_err(|_| sync_error("Invalid library UUID"))?;
    if uuid.get_variant() != Variant::RFC4122
        || !(1..=8).contains(&uuid.get_version_num())
        || uuid.hyphenated().to_string() != value
    {
        return Err(sync_error("Invalid library UUID"));
    }
    Ok(uuid)
}

fn parse_replica_id(value: &str) -> Result<Uuid, AppError> {
    let uuid = Uuid::parse_str(value).map_err(|_| sync_error("Invalid local replica ID"))?;
    if uuid.get_variant() != Variant::RFC4122
        || uuid.get_version() != Some(Version::Random)
        || uuid.hyphenated().to_string() != value
    {
        return Err(sync_error("Invalid local replica ID"));
    }
    Ok(uuid)
}

pub async fn read_replica_identity(
    db: &DatabaseConnection,
) -> Result<Option<ReplicaIdentity>, AppError> {
    let existing = sync_local_meta::Entity::find()
        .one(db)
        .await
        .map_err(database_error)?;
    existing
        .map(|model| {
            parse_library_uuid(&model.library_uuid)?;
            parse_replica_id(&model.replica_id)?;
            if model.protocol != PROTOCOL {
                return Err(sync_error("Local sidecar protocol is unsupported"));
            }
            Ok(ReplicaIdentity {
                library_uuid: model.library_uuid,
                replica_id: model.replica_id,
            })
        })
        .transpose()
}

pub async fn ensure_replica_identity(
    db: &DatabaseConnection,
    library_uuid: &str,
) -> Result<ReplicaIdentity, AppError> {
    parse_library_uuid(library_uuid)?;
    let txn = db.begin().await.map_err(database_error)?;
    if let Some(existing) = sync_local_meta::Entity::find()
        .one(&txn)
        .await
        .map_err(database_error)?
    {
        parse_replica_id(&existing.replica_id)?;
        if existing.protocol != PROTOCOL || existing.library_uuid != library_uuid {
            return Err(sync_error(
                "Local sidecar identity does not match this library",
            ));
        }
        txn.commit().await.map_err(database_error)?;
        return Ok(ReplicaIdentity {
            library_uuid: existing.library_uuid,
            replica_id: existing.replica_id,
        });
    }

    let replica_id = Uuid::new_v4().to_string();
    sync_local_meta::ActiveModel {
        id: Set(Uuid::new_v4().as_simple().to_string()),
        protocol: Set(PROTOCOL.to_owned()),
        library_uuid: Set(library_uuid.to_owned()),
        replica_id: Set(replica_id.clone()),
    }
    .insert(&txn)
    .await
    .map_err(database_error)?;
    txn.commit().await.map_err(database_error)?;
    Ok(ReplicaIdentity {
        library_uuid: library_uuid.to_owned(),
        replica_id,
    })
}
