use std::path::Path;

use automerge::{
    transaction::{CommitOptions, Transactable},
    ActorId, AutoCommit, ObjType,
};

fn main() {
    let manifest_dir = Path::new(env!("CARGO_MANIFEST_DIR"));
    let fixture_dir = manifest_dir.join("../fixtures/library-sidecar-automerge");
    let genesis = std::fs::read(fixture_dir.join("genesis.automerge"))
        .expect("read schema v1 genesis fixture");
    let mut document = AutoCommit::load(&genesis).expect("load schema v1 genesis fixture");
    let schema_v1_heads = document.get_heads();

    document.set_actor(ActorId::from([1_u8; 16]));
    document.put(automerge::ROOT, "schema", 2_u64).unwrap();
    let catalog = document
        .put_object(automerge::ROOT, "catalog", ObjType::Map)
        .unwrap();
    document
        .put_object(&catalog, "books", ObjType::Map)
        .unwrap();
    document
        .commit_with(
            CommitOptions::default()
                .with_message("myreader:migrate-library-sidecar-v2")
                .with_time(0),
        )
        .expect("schema migration must create one change");

    let incremental = document.save_after(&schema_v1_heads);
    std::fs::write(fixture_dir.join("schema-v1-to-v2.incremental"), incremental)
        .expect("write schema migration fixture");

    for head in document.get_heads() {
        println!("{head}");
    }
}
