use myreader_rust_components::sync::document::{
    library_sidecar_heads, load_library_sidecar_document, LIBRARY_SIDECAR_GENESIS_HEAD,
};

#[test]
fn aggregation_should_expose_sync_component_when_application_loads_document() {
    let mut document =
        load_library_sidecar_document("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa").unwrap();

    assert_eq!(
        library_sidecar_heads(&mut document),
        vec![LIBRARY_SIDECAR_GENESIS_HEAD]
    );
}
