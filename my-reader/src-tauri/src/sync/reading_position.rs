use sea_orm::{DatabaseConnection, DatabaseTransaction, TransactionTrait};
use tracing::info;
use uuid::Uuid;

use crate::error::AppError;
use crate::repositories::progress_repo::SqliteProgressRepository;

use super::contract::{
    Change, DomainState, Lww, PositionState, PositionValue, ReaderLocator, Segment,
};
use super::hlc::Hlc;
use super::kernel::{
    enqueue_change, ensure_replica_identity, read_hlc_state, write_hlc_state, SegmentProjection,
};

fn sync_error(message: impl Into<String>) -> AppError {
    AppError::Sync(message.into())
}

fn format_name(format: &str) -> Result<String, AppError> {
    let value = format.trim().to_uppercase();
    if value.is_empty() {
        return Err(sync_error("Reading position format is empty"));
    }
    Ok(value)
}

fn locator_position(locator: &ReaderLocator) -> Option<u64> {
    locator.locations.as_ref()?.get("position")?.as_u64()
}

fn locator_total_progression(locator: &ReaderLocator) -> Option<f64> {
    locator
        .locations
        .as_ref()?
        .get("totalProgression")?
        .as_f64()
}

async fn project_position(
    txn: &DatabaseTransaction,
    state: &PositionState,
) -> Result<(), AppError> {
    let book_id = i64::try_from(state.book_id)
        .map_err(|_| sync_error("Reading position book ID is invalid"))?;
    let locator_json = serde_json::to_string(&state.register.value.locator)
        .map_err(|error| AppError::Serialize(error.to_string()))?;
    let physical_ms = Hlc::parse(&state.register.clock)
        .map_err(|error| sync_error(error.to_string()))?
        .physical_ms;
    SqliteProgressRepository::write_position_state(
        txn,
        book_id,
        &state.format,
        &locator_json,
        state.register.value.display_progression,
        physical_ms as f64,
        &state.register.clock,
    )
    .await
}

pub async fn write_local_position(
    db: &DatabaseConnection,
    library_uuid: &str,
    book_id: i64,
    format: &str,
    locator: ReaderLocator,
    display_progression: Option<f64>,
    now_ms: u64,
) -> Result<(), AppError> {
    let book_id = u64::try_from(book_id)
        .ok()
        .filter(|value| *value > 0)
        .ok_or_else(|| sync_error("Reading position book ID is invalid"))?;
    let format = format_name(format)?;
    if locator.href.is_empty()
        || locator.media_type.is_empty()
        || display_progression
            .is_some_and(|value| !value.is_finite() || !(0.0..=1.0).contains(&value))
    {
        return Err(sync_error("Reading position value is invalid"));
    }
    let locator_href = locator.href.clone();
    let locator_position = locator_position(&locator);
    let locator_total_progression = locator_total_progression(&locator);
    let identity = ensure_replica_identity(db, library_uuid).await?;
    let replica_id =
        Uuid::parse_str(&identity.replica_id).map_err(|_| sync_error("Invalid replica ID"))?;
    let txn = db
        .begin()
        .await
        .map_err(|error| AppError::Database(error.to_string()))?;
    let (physical_ms, counter) = read_hlc_state(&txn).await?.unwrap_or((0, 0));
    let next = Hlc::next_local(physical_ms, counter, now_ms, replica_id)
        .map_err(|error| sync_error(error.to_string()))?;
    let clock = next
        .encode()
        .map_err(|error| sync_error(error.to_string()))?;
    let state = PositionState {
        book_id,
        format: format.clone(),
        register: Lww {
            clock: clock.clone(),
            value: PositionValue {
                locator,
                display_progression,
            },
        },
    };
    project_position(&txn, &state).await?;
    write_hlc_state(&txn, next.physical_ms, next.counter).await?;
    enqueue_change(
        &txn,
        &Change {
            change_id: Uuid::new_v4().as_simple().to_string(),
            clock: clock.clone(),
            state: DomainState::Position(state),
        },
    )
    .await?;
    txn.commit()
        .await
        .map_err(|error| AppError::Database(error.to_string()))?;
    info!(
        target: "myreader_sync",
        event = "reading_position.local_write",
        library_uuid,
        replica_id = %identity.replica_id,
        book_id,
        format,
        clock,
        locator_href,
        locator_position = ?locator_position,
        locator_total_progression = ?locator_total_progression,
        display_progression = ?display_progression,
        "Committed local reading position"
    );
    Ok(())
}

pub struct ReadingPositionProjection {
    local_replica_id: Uuid,
    now_ms: u64,
}

impl ReadingPositionProjection {
    pub fn new(local_replica_id: &str, now_ms: u64) -> Result<Self, AppError> {
        Ok(Self {
            local_replica_id: Uuid::parse_str(local_replica_id)
                .map_err(|_| sync_error("Invalid replica ID"))?,
            now_ms,
        })
    }
}

#[async_trait::async_trait]
impl SegmentProjection for ReadingPositionProjection {
    async fn apply(&self, txn: &DatabaseTransaction, segment: &Segment) -> Result<(), AppError> {
        let (mut physical_ms, mut counter) = read_hlc_state(txn).await?.unwrap_or((0, 0));

        for change in &segment.changes {
            let DomainState::Position(incoming) = &change.state else {
                return Err(sync_error("Unsupported projection domain"));
            };
            let book_id = i64::try_from(incoming.book_id)
                .map_err(|_| sync_error("Reading position book ID is invalid"))?;
            let current =
                SqliteProgressRepository::find_position_state(txn, book_id, &incoming.format)
                    .await?;
            let current_clock = current
                .as_ref()
                .and_then(|row| row.sync_clock.as_deref())
                .map(str::to_owned);
            let merged = if let Some(current) = current.filter(|row| row.sync_clock.is_some()) {
                let locator = serde_json::from_str(&current.locator_json)
                    .map_err(|error| AppError::Serialize(error.to_string()))?;
                let current_state = DomainState::Position(PositionState {
                    book_id: incoming.book_id,
                    format: current.format,
                    register: Lww {
                        clock: current.sync_clock.expect("filtered sync clock"),
                        value: PositionValue {
                            locator,
                            display_progression: current.display_progression,
                        },
                    },
                });
                match current_state
                    .merge(&DomainState::Position(incoming.clone()))
                    .map_err(|error| sync_error(error.to_string()))?
                {
                    DomainState::Position(state) => state,
                    _ => unreachable!("position merge returns a position"),
                }
            } else {
                incoming.clone()
            };
            info!(
                target: "myreader_sync",
                event = "reading_position.merge",
                source_replica_id = %segment.replica_id,
                sequence = %segment.sequence,
                change_id = %change.change_id,
                book_id = incoming.book_id,
                format = %incoming.format,
                current_clock = ?current_clock,
                incoming_clock = %incoming.register.clock,
                selected_clock = %merged.register.clock,
                selected_source = if merged.register.clock == incoming.register.clock {
                    "remote"
                } else {
                    "local"
                },
                locator_href = %merged.register.value.locator.href,
                locator_position = ?locator_position(&merged.register.value.locator),
                locator_total_progression =
                    ?locator_total_progression(&merged.register.value.locator),
                display_progression = ?merged.register.value.display_progression,
                "Merged remote reading position"
            );
            project_position(txn, &merged).await?;

            let mut remote_clocks = vec![change.clock.as_str()];
            if incoming.register.clock != change.clock {
                remote_clocks.push(incoming.register.clock.as_str());
            }
            for remote_clock in remote_clocks {
                let remote =
                    Hlc::parse(remote_clock).map_err(|error| sync_error(error.to_string()))?;
                let observed = Hlc::observe(
                    physical_ms,
                    counter,
                    &remote,
                    self.now_ms,
                    self.local_replica_id,
                )
                .map_err(|error| sync_error(error.to_string()))?;
                physical_ms = observed.physical_ms;
                counter = observed.counter;
            }
        }

        write_hlc_state(txn, physical_ms, counter).await
    }
}

#[cfg(test)]
mod tests {
    use sea_orm::{Database, EntityTrait};
    use sea_orm_migration::MigratorTrait;

    use crate::entities::app::{reading_progress, sync_outbox};

    use super::*;

    const LIBRARY_UUID: &str = "018f2f8d-980b-40ef-b72e-c6e86cb7cc28";
    const REMOTE_REPLICA_ID: &str = "018f2f8d-980b-40ef-b72e-c6e86cb7cc30";

    async fn database() -> DatabaseConnection {
        let db = Database::connect("sqlite::memory:").await.unwrap();
        crate::migration::LibraryMigrator::up(&db, None)
            .await
            .unwrap();
        db
    }

    fn locator(href: &str, progression: f64) -> ReaderLocator {
        ReaderLocator {
            href: href.to_owned(),
            media_type: "application/xhtml+xml".to_owned(),
            target: None,
            title: None,
            locations: Some(serde_json::json!({ "progression": progression })),
            text: None,
        }
    }

    #[tokio::test]
    async fn should_advance_hlc_and_enqueue_each_change_when_wall_clock_moves_backward() {
        let db = database().await;
        write_local_position(
            &db,
            LIBRARY_UUID,
            42,
            "epub",
            locator("chapter-8.xhtml", 0.8),
            Some(0.8),
            2_000,
        )
        .await
        .unwrap();
        write_local_position(
            &db,
            LIBRARY_UUID,
            42,
            "epub",
            locator("chapter-2.xhtml", 0.2),
            Some(0.2),
            1_500,
        )
        .await
        .unwrap();

        let progress = reading_progress::Entity::find()
            .one(&db)
            .await
            .unwrap()
            .unwrap();
        let clock = Hlc::parse(progress.sync_clock.as_deref().unwrap()).unwrap();
        assert_eq!(progress.display_progression, Some(0.2));
        assert_eq!(clock.physical_ms, 2_000);
        assert_eq!(clock.counter, 1);
        assert_eq!(sync_outbox::Entity::find().all(&db).await.unwrap().len(), 2);
    }

    #[tokio::test]
    async fn should_accept_backward_position_when_remote_hlc_is_newer() {
        let db = database().await;
        write_local_position(
            &db,
            LIBRARY_UUID,
            42,
            "EPUB",
            locator("chapter-8.xhtml", 0.8),
            Some(0.8),
            2_000,
        )
        .await
        .unwrap();
        let identity = ensure_replica_identity(&db, LIBRARY_UUID).await.unwrap();
        let remote_clock = Hlc {
            physical_ms: 2_500,
            counter: 0,
            replica_id: Uuid::parse_str(REMOTE_REPLICA_ID).unwrap(),
        }
        .encode()
        .unwrap();
        let segment = Segment {
            protocol: super::super::contract::PROTOCOL.to_owned(),
            library_uuid: LIBRARY_UUID.to_owned(),
            replica_id: REMOTE_REPLICA_ID.to_owned(),
            sequence: "1".to_owned(),
            changes: vec![Change {
                change_id: Uuid::new_v4().as_simple().to_string(),
                clock: remote_clock.clone(),
                state: DomainState::Position(PositionState {
                    book_id: 42,
                    format: "EPUB".to_owned(),
                    register: Lww {
                        clock: remote_clock,
                        value: PositionValue {
                            locator: locator("chapter-2.xhtml", 0.2),
                            display_progression: Some(0.2),
                        },
                    },
                }),
            }],
        };
        let projection = ReadingPositionProjection::new(&identity.replica_id, 2_200).unwrap();
        let txn = db.begin().await.unwrap();
        projection.apply(&txn, &segment).await.unwrap();
        txn.commit().await.unwrap();

        let progress = reading_progress::Entity::find()
            .one(&db)
            .await
            .unwrap()
            .unwrap();
        assert_eq!(progress.display_progression, Some(0.2));
        assert!(progress.locator_json.contains("chapter-2.xhtml"));
    }
}
