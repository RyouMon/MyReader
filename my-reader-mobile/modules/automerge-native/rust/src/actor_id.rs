use automerge as am;

pub struct ActorId(Vec<u8>);

impl From<ActorId> for automerge::ActorId {
    fn from(value: ActorId) -> Self {
        am::ActorId::from(value.0)
    }
}

impl<'a> From<&'a am::ActorId> for ActorId {
    fn from(value: &'a am::ActorId) -> Self {
        ActorId(value.to_bytes().to_vec())
    }
}

uniffi::custom_type!(ActorId, Vec<u8>, {
    try_lift: |val| Ok(ActorId(val)),
    lower: |obj| obj.0,
});
