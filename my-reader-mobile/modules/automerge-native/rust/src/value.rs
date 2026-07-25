use automerge as am;

use crate::{ObjId, ObjType, ScalarValue};

#[derive(Debug)]
pub enum Value {
    Object { typ: ObjType, id: ObjId },
    Scalar { value: ScalarValue },
}

#[derive(Debug)]
pub struct ValueWithId {
    pub value: Value,
    pub operation_id: String,
}

impl<'a> From<(am::Value<'a>, am::ObjId)> for Value {
    fn from(value: (am::Value<'a>, am::ObjId)) -> Self {
        match value {
            (am::Value::Object(ty), id) => Value::Object {
                typ: ObjType::from(ty),
                id: id.into(),
            },
            (am::Value::Scalar(s), _) => Value::Scalar {
                value: s.as_ref().into(),
            },
        }
    }
}

impl<'a> From<(am::Value<'a>, am::ObjId)> for ValueWithId {
    fn from((value, id): (am::Value<'a>, am::ObjId)) -> Self {
        Self {
            value: (value, id.clone()).into(),
            operation_id: id.to_string(),
        }
    }
}
