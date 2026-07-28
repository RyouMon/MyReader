use std::{fs, path::PathBuf};

#[test]
fn should_match_checked_in_typescript_when_rust_contract_is_generated() {
    let generated = my_reader_core_ffi::generate_typescript_contract().unwrap();
    let path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../../src/services/core/contract.generated.ts");
    let checked_in = fs::read_to_string(path).unwrap();

    assert_eq!(checked_in, generated);
}
