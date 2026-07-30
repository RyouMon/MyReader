use std::{env, fs, path::PathBuf};

fn main() {
    let output = myreader_rust_components::generate_typescript_contract()
        .expect("failed to generate TypeScript core contract");
    let path = contract_path();
    let check = env::args().skip(1).any(|argument| argument == "--check");

    if check {
        let current = fs::read_to_string(&path)
            .unwrap_or_else(|error| panic!("failed to read {}: {error}", path.display()));
        assert_eq!(
            current,
            output,
            "{} is stale; run `pnpm core:generate-contract`",
            path.display()
        );
        return;
    }

    fs::write(&path, output)
        .unwrap_or_else(|error| panic!("failed to write {}: {error}", path.display()));
}

fn contract_path() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../my-reader-mobile/src/services/core/contract.generated.ts")
}
