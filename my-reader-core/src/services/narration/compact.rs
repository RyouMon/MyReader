use super::*;

pub(super) fn input(requests: &[NarrationRequest]) -> Value {
    json!({"units":requests.iter().enumerate().map(|(index, request)|
        json!({"id":format!("u{index}"),"text":request.text})).collect::<Vec<_>>()})
}

pub(super) fn schema() -> Value {
    let part = json!({"type":"object","properties":{
        "start":{"type":"string"},"characterId":{"type":"string"},"delivery":{"type":"string"}
    },"required":["start","characterId","delivery"],"additionalProperties":false});
    json!({"type":"object","properties":{"segments":{"type":"array","items":{
        "type":"object","properties":{"from":{"type":"string"},"through":{"type":"string"},
        "characterId":{"type":"string"},"delivery":{"type":"string"},"parts":{"type":"array","items":part}},
        "required":["from","through","characterId","delivery","parts"],"additionalProperties":false
    }}},"required":["segments"],"additionalProperties":false})
}

pub(super) fn decode(
    requests: &[NarrationRequest],
    value: &Value,
    settings: &BookNarrationSettings,
) -> Result<Vec<NarrationPlan>, CoreError> {
    let ranges = value["segments"]
        .as_array()
        .ok_or_else(|| error("PLAN_INVALID"))?;
    let mut plans = Vec::new();
    for range in ranges {
        let from = unit_index(&range["from"])?;
        let through = unit_index(&range["through"])?;
        if from != plans.len() || through < from || through >= requests.len() {
            return Err(error("PLAN_INVALID"));
        }
        let parts = range["parts"]
            .as_array()
            .ok_or_else(|| error("PLAN_INVALID"))?;
        if !parts.is_empty() && (from != through || parts.len() > 128) {
            return Err(error("PLAN_INVALID"));
        }
        for request in &requests[from..=through] {
            let text = &request.text;
            let mut segments = Vec::new();
            if parts.is_empty() {
                segments.push(segment(
                    0,
                    text.encode_utf16().count() as u32,
                    range,
                    settings,
                )?);
            } else {
                let mut boundaries = vec![0];
                for (index, part) in parts.iter().enumerate() {
                    let anchor = part["start"]
                        .as_str()
                        .ok_or_else(|| error("PLAN_INVALID"))?;
                    if index == 0 {
                        if !anchor.is_empty() {
                            return Err(error("PLAN_INVALID"));
                        }
                        continue;
                    }
                    if anchor.is_empty() || anchor.len() > 512 {
                        return Err(error("PLAN_INVALID"));
                    }
                    // Reject ambiguous anchors rather than guess a speaker boundary.
                    let mut matches = text.match_indices(anchor);
                    let offset = matches
                        .next()
                        .map(|(offset, _)| offset)
                        .ok_or_else(|| error("PLAN_INVALID"))?;
                    if matches.next().is_some() || offset <= *boundaries.last().unwrap() {
                        return Err(error("PLAN_INVALID"));
                    }
                    boundaries.push(offset);
                }
                boundaries.push(text.len());
                for (index, part) in parts.iter().enumerate() {
                    segments.push(segment(
                        text[..boundaries[index]].encode_utf16().count() as u32,
                        text[..boundaries[index + 1]].encode_utf16().count() as u32,
                        part,
                        settings,
                    )?);
                }
            }
            plans.push(NarrationPlan {
                segments,
                fallback: false,
            });
        }
    }
    if plans.len() != requests.len() {
        return Err(error("PLAN_INVALID"));
    }
    Ok(plans)
}

fn unit_index(value: &Value) -> Result<usize, CoreError> {
    value
        .as_str()
        .and_then(|id| id.strip_prefix('u'))
        .and_then(|id| id.parse().ok())
        .ok_or_else(|| error("PLAN_INVALID"))
}

fn segment(
    start_utf16: u32,
    end_utf16: u32,
    value: &Value,
    settings: &BookNarrationSettings,
) -> Result<NarrationSegment, CoreError> {
    let id = value["characterId"]
        .as_str()
        .ok_or_else(|| error("PLAN_INVALID"))?;
    let delivery = value["delivery"]
        .as_str()
        .filter(|v| v.len() <= 1000)
        .ok_or_else(|| error("PLAN_INVALID"))?;
    let known = settings.characters.iter().any(|c| c.id == id);
    Ok(NarrationSegment {
        start_utf16,
        end_utf16,
        character_id: if known { id.into() } else { NARRATOR_ID.into() },
        delivery: if known {
            delivery.into()
        } else {
            String::new()
        },
    })
}
