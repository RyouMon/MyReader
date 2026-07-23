use std::cmp::Ordering;

use serde::Serialize;

use super::contract::{
    AnnotationState, AnnotationTombstone, BookmarkState, DomainState, FavoriteState, Lww,
    PositionState, ReadingSessionState,
};
use super::hlc::{ContractError, Hlc};

fn same_json<T: Serialize>(left: &T, right: &T) -> bool {
    serde_json::to_value(left).ok() == serde_json::to_value(right).ok()
}

fn merge_lww<T>(left: &Lww<T>, right: &Lww<T>) -> Result<Lww<T>, ContractError>
where
    T: Clone + Serialize,
{
    match Hlc::parse(&left.clock)?.cmp(&Hlc::parse(&right.clock)?) {
        Ordering::Less => Ok(right.clone()),
        Ordering::Greater => Ok(left.clone()),
        Ordering::Equal if same_json(&left.value, &right.value) => Ok(left.clone()),
        Ordering::Equal => Err(ContractError::EqualClockConflict),
    }
}

fn merge_tombstone(
    left: &Option<AnnotationTombstone>,
    right: &Option<AnnotationTombstone>,
) -> Result<Option<AnnotationTombstone>, ContractError> {
    let (Some(left), Some(right)) = (left, right) else {
        return Ok(left.clone().or_else(|| right.clone()));
    };
    match Hlc::parse(&left.clock)?.cmp(&Hlc::parse(&right.clock)?) {
        Ordering::Less => Ok(Some(right.clone())),
        Ordering::Greater => Ok(Some(left.clone())),
        Ordering::Equal if left.deleted_at_ms == right.deleted_at_ms => Ok(Some(left.clone())),
        Ordering::Equal => Err(ContractError::EqualTombstoneConflict),
    }
}

impl DomainState {
    pub fn merge(&self, other: &Self) -> Result<Self, ContractError> {
        match (self, other) {
            (Self::Favorite(left), Self::Favorite(right)) => {
                if left.book_id != right.book_id {
                    return Err(ContractError::IdentityMismatch("book_favorite.v1"));
                }
                Ok(Self::Favorite(FavoriteState {
                    book_id: left.book_id,
                    register: merge_lww(&left.register, &right.register)?,
                }))
            }
            (Self::Position(left), Self::Position(right)) => {
                if (left.book_id, &left.format) != (right.book_id, &right.format) {
                    return Err(ContractError::IdentityMismatch("reading_position.v1"));
                }
                Ok(Self::Position(PositionState {
                    book_id: left.book_id,
                    format: left.format.clone(),
                    register: merge_lww(&left.register, &right.register)?,
                }))
            }
            (Self::Bookmark(left), Self::Bookmark(right)) => {
                if (left.book_id, &left.format, &left.locator_key)
                    != (right.book_id, &right.format, &right.locator_key)
                {
                    return Err(ContractError::IdentityMismatch("bookmark.v1"));
                }
                Ok(Self::Bookmark(BookmarkState {
                    book_id: left.book_id,
                    format: left.format.clone(),
                    locator_key: left.locator_key.clone(),
                    register: merge_lww(&left.register, &right.register)?,
                }))
            }
            (Self::Annotation(left), Self::Annotation(right)) => {
                if left.id != right.id || !same_json(&left.header, &right.header) {
                    return Err(ContractError::IdentityMismatch("annotation.v1"));
                }
                Ok(Self::Annotation(AnnotationState {
                    id: left.id.clone(),
                    header: left.header.clone(),
                    color: merge_lww(&left.color, &right.color)?,
                    note: merge_lww(&left.note, &right.note)?,
                    tombstone: merge_tombstone(&left.tombstone, &right.tombstone)?,
                }))
            }
            (Self::ReadingSession(left), Self::ReadingSession(right)) => {
                if left.id != right.id || !same_json(&left.header, &right.header) {
                    return Err(ContractError::IdentityMismatch("reading_session.v1"));
                }
                Ok(Self::ReadingSession(ReadingSessionState {
                    id: left.id.clone(),
                    header: left.header.clone(),
                    duration_seconds: left.duration_seconds.max(right.duration_seconds),
                }))
            }
            (Self::ReadingCompletion(left), Self::ReadingCompletion(right)) => {
                if left.book_id != right.book_id {
                    return Err(ContractError::IdentityMismatch("reading_completion.v1"));
                }
                if left.id == right.id {
                    if !same_json(left, right) {
                        return Err(ContractError::IdentityMismatch("reading_completion.v1"));
                    }
                    return Ok(self.clone());
                }
                let left_key = (left.completed_at_ms, &left.id);
                let right_key = (right.completed_at_ms, &right.id);
                Ok(if left_key <= right_key {
                    self.clone()
                } else {
                    other.clone()
                })
            }
            _ => Err(ContractError::DomainMismatch),
        }
    }

    pub fn assert_writer(&self, replica_id: &str) -> Result<(), ContractError> {
        if let Self::ReadingSession(session) = self {
            if session.header.origin_replica_id != replica_id {
                return Err(ContractError::SessionWriterMismatch);
            }
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use serde::Deserialize;
    use uuid::Uuid;

    use super::*;
    use crate::sync::contract::{FavoriteValue, ReadingCompletionState};

    #[derive(Deserialize)]
    struct HlcFixture {
        #[serde(rename = "replicaId")]
        replica_id: String,
    }

    #[derive(Deserialize)]
    struct MergeFixture {
        name: String,
        left: DomainState,
        right: DomainState,
        expected: DomainState,
    }

    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct ContractFixture {
        hlc: Vec<HlcFixture>,
        merge_cases: Vec<MergeFixture>,
    }

    fn fixture() -> ContractFixture {
        serde_json::from_str(include_str!("fixtures/contract.json"))
            .expect("shared sidecar fixture must parse")
    }

    fn law_clock(index: u64, offset: u64, replica_id: &str) -> String {
        Hlc {
            physical_ms: 1_771_831_715_000,
            counter: index * 3 + offset,
            replica_id: Uuid::parse_str(replica_id).unwrap(),
        }
        .encode()
        .expect("valid law clock")
    }

    fn generated_law_states(item: &MergeFixture, replica_id: &str) -> Vec<DomainState> {
        (0..5)
            .map(|index| match &item.left {
                DomainState::Favorite(base) => DomainState::Favorite(FavoriteState {
                    book_id: base.book_id,
                    register: Lww {
                        clock: law_clock(index, 0, replica_id),
                        value: FavoriteValue {
                            is_favorite: index % 2 == 0,
                            added_at_ms: (index % 2 == 0).then_some(1_771_831_715_000 + index),
                        },
                    },
                }),
                DomainState::Position(base) => {
                    let mut value = base.register.value.clone();
                    value.display_progression = Some(index as f64 / 5.0);
                    value.locator.href = format!("OPS/chapter-{}.xhtml", index + 1);
                    value.locator.locations = Some(serde_json::json!({
                        "progression": index as f64 / 5.0,
                        "position": index + 1,
                    }));
                    DomainState::Position(PositionState {
                        book_id: base.book_id,
                        format: base.format.clone(),
                        register: Lww {
                            clock: law_clock(index, 0, replica_id),
                            value,
                        },
                    })
                }
                DomainState::Bookmark(base) => {
                    let mut value = base.register.value.clone();
                    value.present = index % 2 == 0;
                    value.id = format!("018f2f8d980b40efb72ec6e86cb7100{index}");
                    value.deleted_at_ms = (index % 2 != 0).then_some(1_771_831_715_000 + index);
                    DomainState::Bookmark(BookmarkState {
                        book_id: base.book_id,
                        format: base.format.clone(),
                        locator_key: base.locator_key.clone(),
                        register: Lww {
                            clock: law_clock(index, 0, replica_id),
                            value,
                        },
                    })
                }
                DomainState::Annotation(base) => DomainState::Annotation(AnnotationState {
                    id: base.id.clone(),
                    header: base.header.clone(),
                    color: Lww {
                        clock: law_clock(index, 0, replica_id),
                        value: format!("color-{index}"),
                    },
                    note: Lww {
                        clock: law_clock(index, 1, replica_id),
                        value: (index % 2 != 0).then(|| format!("note-{index}")),
                    },
                    tombstone: (index % 2 != 0).then(|| AnnotationTombstone {
                        clock: law_clock(index, 2, replica_id),
                        deleted_at_ms: 1_771_831_715_000 + index,
                    }),
                }),
                DomainState::ReadingSession(base) => {
                    DomainState::ReadingSession(ReadingSessionState {
                        id: base.id.clone(),
                        header: base.header.clone(),
                        duration_seconds: index * 137,
                    })
                }
                DomainState::ReadingCompletion(base) => {
                    DomainState::ReadingCompletion(ReadingCompletionState {
                        book_id: base.book_id,
                        id: format!("018f2f8d980b40efb72ec6e86cb7200{index}"),
                        format: base.format.clone(),
                        local_day: format!("2026-07-{:02}", 23 - index),
                        completed_at_ms: 1_771_831_715_000 - index * 1_000,
                    })
                }
            })
            .collect()
    }

    #[test]
    fn should_match_expected_state_when_merging_shared_fixtures() {
        for item in fixture().merge_cases {
            assert_eq!(
                item.left
                    .merge(&item.right)
                    .unwrap_or_else(|error| { panic!("fixture '{}' failed: {error}", item.name) }),
                item.expected
            );
            assert_eq!(item.right.merge(&item.left).unwrap(), item.expected);
        }
    }

    #[test]
    fn should_satisfy_crdt_laws_when_generated_domain_states_are_combined() {
        let fixture = fixture();
        let replica_id = &fixture.hlc[0].replica_id;
        for item in fixture.merge_cases {
            let states = generated_law_states(&item, replica_id);
            for left in &states {
                assert_eq!(left.merge(left).unwrap(), *left);
                for right in &states {
                    assert_eq!(left.merge(right).unwrap(), right.merge(left).unwrap());
                    for third in &states {
                        assert_eq!(
                            left.merge(right).unwrap().merge(third).unwrap(),
                            left.merge(&right.merge(third).unwrap()).unwrap()
                        );
                    }
                }
            }
        }
    }

    #[test]
    fn should_reject_session_update_when_writer_is_not_origin() {
        let session = fixture()
            .merge_cases
            .into_iter()
            .find_map(|item| match item.left {
                DomainState::ReadingSession(state) => Some(DomainState::ReadingSession(state)),
                _ => None,
            })
            .expect("session fixture");
        assert_eq!(
            session.assert_writer("018f2f8d-980b-40ef-b72e-c6e86cb7cc30"),
            Err(ContractError::SessionWriterMismatch)
        );
    }
}
