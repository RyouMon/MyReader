use std::cmp::Ordering;

use thiserror::Error;
use uuid::{Uuid, Variant};

use super::contract::MAX_FUTURE_SKEW_MS;

#[derive(Debug, Error, PartialEq)]
pub enum ContractError {
    #[error("invalid sidecar HLC")]
    InvalidHlc,
    #[error("{0} immutable identity does not match")]
    IdentityMismatch(&'static str),
    #[error("equal HLC values must have identical payloads")]
    EqualClockConflict,
    #[error("equal tombstone HLC values must have identical timestamps")]
    EqualTombstoneConflict,
    #[error("cannot merge different domains")]
    DomainMismatch,
    #[error("reading session updates must come from the origin replica")]
    SessionWriterMismatch,
    #[error("HLC counter overflow")]
    CounterOverflow,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Hlc {
    pub physical_ms: u64,
    pub counter: u64,
    pub replica_id: Uuid,
}

impl Hlc {
    fn validate_replica_id(replica_id: &Uuid) -> Result<(), ContractError> {
        if replica_id.get_version_num() != 4 || replica_id.get_variant() != Variant::RFC4122 {
            return Err(ContractError::InvalidHlc);
        }
        Ok(())
    }

    pub fn parse(value: &str) -> Result<Self, ContractError> {
        let mut parts = value.split('-');
        let physical = parts.next().ok_or(ContractError::InvalidHlc)?;
        let counter = parts.next().ok_or(ContractError::InvalidHlc)?;
        let replica = parts.next().ok_or(ContractError::InvalidHlc)?;
        if parts.next().is_some()
            || physical.len() != 16
            || counter.len() != 16
            || replica.len() != 32
            || !value
                .bytes()
                .all(|byte| byte == b'-' || byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
        {
            return Err(ContractError::InvalidHlc);
        }
        let replica_id = Uuid::parse_str(replica).map_err(|_| ContractError::InvalidHlc)?;
        Self::validate_replica_id(&replica_id)?;
        Ok(Self {
            physical_ms: u64::from_str_radix(physical, 16)
                .map_err(|_| ContractError::InvalidHlc)?,
            counter: u64::from_str_radix(counter, 16).map_err(|_| ContractError::InvalidHlc)?,
            replica_id,
        })
    }

    pub fn encode(&self) -> Result<String, ContractError> {
        Self::validate_replica_id(&self.replica_id)?;
        Ok(format!(
            "{:016x}-{:016x}-{}",
            self.physical_ms,
            self.counter,
            self.replica_id.as_simple()
        ))
    }

    pub fn next_local(
        physical_ms: u64,
        counter: u64,
        now_ms: u64,
        replica_id: Uuid,
    ) -> Result<Self, ContractError> {
        Self::validate_replica_id(&replica_id)?;
        if now_ms > physical_ms {
            return Ok(Self {
                physical_ms: now_ms,
                counter: 0,
                replica_id,
            });
        }
        Ok(Self {
            physical_ms,
            counter: counter
                .checked_add(1)
                .ok_or(ContractError::CounterOverflow)?,
            replica_id,
        })
    }

    pub fn observe(
        local_physical_ms: u64,
        local_counter: u64,
        remote: &Self,
        now_ms: u64,
        replica_id: Uuid,
    ) -> Result<Self, ContractError> {
        Self::validate_replica_id(&remote.replica_id)?;
        Self::validate_replica_id(&replica_id)?;
        let physical_ms = local_physical_ms.max(remote.physical_ms).max(now_ms);
        let counter = if physical_ms == local_physical_ms && physical_ms == remote.physical_ms {
            local_counter
                .max(remote.counter)
                .checked_add(1)
                .ok_or(ContractError::CounterOverflow)?
        } else if physical_ms == local_physical_ms {
            local_counter
                .checked_add(1)
                .ok_or(ContractError::CounterOverflow)?
        } else if physical_ms == remote.physical_ms {
            remote
                .counter
                .checked_add(1)
                .ok_or(ContractError::CounterOverflow)?
        } else {
            0
        };
        Ok(Self {
            physical_ms,
            counter,
            replica_id,
        })
    }

    pub fn exceeds_future_skew(&self, now_ms: u64) -> bool {
        self.physical_ms > now_ms.saturating_add(MAX_FUTURE_SKEW_MS)
    }
}

impl Ord for Hlc {
    fn cmp(&self, other: &Self) -> Ordering {
        (self.physical_ms, self.counter, self.replica_id.as_u128()).cmp(&(
            other.physical_ms,
            other.counter,
            other.replica_id.as_u128(),
        ))
    }
}

impl PartialOrd for Hlc {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

#[cfg(test)]
mod tests {
    use serde::Deserialize;

    use super::*;

    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct HlcFixture {
        encoded: String,
        physical_ms: String,
        counter: String,
        replica_id: String,
    }

    #[derive(Deserialize)]
    struct ContractFixture {
        hlc: Vec<HlcFixture>,
    }

    fn fixture() -> ContractFixture {
        serde_json::from_str(include_str!("fixtures/contract.json"))
            .expect("shared sidecar fixture must parse")
    }

    #[test]
    fn should_round_trip_hlc_when_parsing_shared_fixtures() {
        for item in fixture().hlc {
            let parsed = Hlc::parse(&item.encoded).expect("valid fixture HLC");
            assert_eq!(parsed.physical_ms.to_string(), item.physical_ms);
            assert_eq!(parsed.counter.to_string(), item.counter);
            assert_eq!(parsed.replica_id.to_string(), item.replica_id);
            assert_eq!(parsed.encode().unwrap(), item.encoded);
        }
    }

    #[test]
    fn should_reject_hlc_when_replica_uuid_has_non_ietf_variant() {
        assert_eq!(
            Hlc::parse("0000019c89abcdef-000000000000002a-018f2f8d980b00ef772ec6e86cb7cc29"),
            Err(ContractError::InvalidHlc)
        );
    }

    #[test]
    fn should_reject_hlc_when_replica_uuid_is_not_version_4() {
        assert_eq!(
            Hlc::parse("0000019c89abcdef-000000000000002a-018f2f8d980b70efb72ec6e86cb7cc29"),
            Err(ContractError::InvalidHlc)
        );
    }

    #[test]
    fn should_reject_hlc_when_encoding_non_v4_replica_uuid() {
        let clock = Hlc {
            physical_ms: 1,
            counter: 0,
            replica_id: Uuid::parse_str("018f2f8d-980b-70ef-b72e-c6e86cb7cc29").unwrap(),
        };
        assert_eq!(clock.encode(), Err(ContractError::InvalidHlc));
    }

    #[test]
    fn should_quarantine_clock_when_future_skew_is_exceeded() {
        let replica_id = Uuid::parse_str("018f2f8d-980b-40ef-b72e-c6e86cb7cc29").unwrap();
        let clock = Hlc {
            physical_ms: 1_000_000 + MAX_FUTURE_SKEW_MS + 1,
            counter: 0,
            replica_id,
        };
        assert!(clock.exceeds_future_skew(1_000_000));
    }
}
