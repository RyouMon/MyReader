use crate::sync::document::{
    library_sidecar_heads, load_library_sidecar_document, LIBRARY_SIDECAR_GENESIS_HEAD,
};

#[test]
fn document_should_load_canonical_genesis_when_replica_opens_library() {
    let mut document =
        load_library_sidecar_document("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa").unwrap();

    assert_eq!(
        library_sidecar_heads(&mut document),
        vec![LIBRARY_SIDECAR_GENESIS_HEAD]
    );
}
