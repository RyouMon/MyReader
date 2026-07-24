use std::{env, fs, path::PathBuf, str::FromStr};

use automerge::ChangeHash;
use my_reader_lib::sync::automerge_document::{
    load_library_sidecar_document, set_library_identity, set_reading_position,
    ReadingPositionValue, LIBRARY_SIDECAR_GENESIS_HEAD,
};

fn main() {
    let output = env::args()
        .nth(1)
        .map(PathBuf::from)
        .expect("usage: generate_automerge_interop_fixture <output>");
    let replica_id = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    let mut document =
        load_library_sidecar_document(replica_id).expect("canonical genesis must load");
    set_library_identity(&mut document, "11111111-2222-4333-8444-555555555555", 1)
        .expect("library identity must be written");
    set_reading_position(
        &mut document,
        7,
        &ReadingPositionValue {
            format: "PDF".to_owned(),
            locator_json: r#"{"href":"page-3"}"#.to_owned(),
            display_progression_ppm: Some(300_000),
            recorded_at: 2_000,
            replica_id: replica_id.to_owned(),
        },
    )
    .expect("reading position must be written");
    let genesis_head =
        ChangeHash::from_str(LIBRARY_SIDECAR_GENESIS_HEAD).expect("genesis head must be valid");
    fs::write(output, document.save_after(&[genesis_head]))
        .expect("Rust Automerge incremental fixture must be written");
}
