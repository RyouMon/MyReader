use automerge as am;

pub struct Cursor(Vec<u8>);

pub enum Position {
    Cursor { position: Cursor },
    Index { position: u64 },
}

impl From<Cursor> for am::Cursor {
    fn from(value: Cursor) -> Self {
        am::Cursor::try_from(value.0).unwrap()
    }
}

impl From<am::Cursor> for Cursor {
    fn from(value: am::Cursor) -> Self {
        Cursor(value.to_bytes())
    }
}

uniffi::custom_type!(Cursor, Vec<u8>, {
    try_lift: |val| Ok(Cursor(val)),
    lower: |obj| obj.0,
});
