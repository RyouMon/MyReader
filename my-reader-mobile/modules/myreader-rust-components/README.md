# MyReader Rust Components

This Expo module is the mobile adapter for the shared Rust component aggregation crate. Rust owns
the sync use cases, SQLite transactions, Automerge document, transport, and scheduler policy.
Swift, Kotlin, and TypeScript only convert platform inputs, errors, and result DTOs.

## Source and generated files

- `crates/myreader-rust-components/src/lib.rs` is the exported UniFFI API.
- `src/MyReaderRustComponentsModule.ts`, `ios/MyReaderRustComponentsModule.swift`, and
  `android/src/main/java/com/myreader/rustcomponents/MyReaderRustComponentsModule.kt` are
  handwritten adapters.
- `ios/generated/` and `android/src/main/java/com/myreader/rustcomponents/uniffi/` are regenerated
  by `scripts/generate-bindings.sh`.
- Native Rust artifacts are generated under `build/` and must not be committed.

After changing the exported Rust API, run one of:

```bash
# Generate bindings, build the iOS simulator artifact, and check artifact ownership.
./my-reader-mobile/modules/myreader-rust-components/scripts/verify-native.sh ios

# Generate bindings, build all configured Android ABIs, and check artifact ownership.
./my-reader-mobile/modules/myreader-rust-components/scripts/verify-native.sh android

# Verify both platforms.
./my-reader-mobile/modules/myreader-rust-components/scripts/verify-native.sh
```

Run the shared component tests independently with:

```bash
cargo test -p myreader-sync -p myreader-rust-components
```
