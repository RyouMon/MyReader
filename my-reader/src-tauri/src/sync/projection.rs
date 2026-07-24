use sea_orm::DatabaseTransaction;
use uuid::Uuid;

use crate::error::AppError;

use super::contract::{DomainState, Segment};
use super::favorite::apply_favorite_change;
use super::hlc::Hlc;
use super::kernel::{read_hlc_state, write_hlc_state, SegmentProjection};
use super::reading_position::apply_position_change;

fn sync_error(message: impl Into<String>) -> AppError {
    AppError::Sync(message.into())
}

pub struct LibrarySidecarProjection {
    local_replica_id: Uuid,
    now_ms: u64,
}

impl LibrarySidecarProjection {
    pub fn new(local_replica_id: &str, now_ms: u64) -> Result<Self, AppError> {
        Ok(Self {
            local_replica_id: Uuid::parse_str(local_replica_id)
                .map_err(|_| sync_error("Invalid replica ID"))?,
            now_ms,
        })
    }
}

#[async_trait::async_trait]
impl SegmentProjection for LibrarySidecarProjection {
    async fn apply(&self, txn: &DatabaseTransaction, segment: &Segment) -> Result<(), AppError> {
        let (mut physical_ms, mut counter) = read_hlc_state(txn).await?.unwrap_or((0, 0));

        for change in &segment.changes {
            let state_clock = match &change.state {
                DomainState::Favorite(incoming) => {
                    apply_favorite_change(txn, segment, change, incoming).await?;
                    &incoming.register.clock
                }
                DomainState::Position(incoming) => {
                    apply_position_change(txn, segment, change, incoming).await?;
                    &incoming.register.clock
                }
                _ => return Err(sync_error("Unsupported projection domain")),
            };
            let mut remote_clocks = vec![change.clock.as_str()];
            if state_clock != &change.clock {
                remote_clocks.push(state_clock);
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
