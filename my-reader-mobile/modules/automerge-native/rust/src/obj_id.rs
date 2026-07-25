use automerge as am;

#[derive(Debug, Clone)]
pub struct ObjId(Vec<u8>);

impl From<ObjId> for automerge::ObjId {
    fn from(value: ObjId) -> Self {
        am::ObjId::try_from(value.0.as_slice()).unwrap()
    }
}

impl From<am::ObjId> for ObjId {
    fn from(value: am::ObjId) -> Self {
        ObjId(value.to_bytes())
    }
}

pub fn root() -> ObjId {
    am::ROOT.into()
}

uniffi::custom_type!(ObjId, Vec<u8>, {
    try_lift: |val| Ok(ObjId(val)),
    lower: |obj| obj.0,
});
