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
cargo test -p myreader-core -p myreader-rust-components
```

Run the native runtime smoke tests with:

```bash
# Regenerate the iOS project first when the test-spec scheme is missing, then:
cd my-reader-mobile/ios
pod install
RUST_COMPONENTS_SIMULATOR_UDID="paste-simulator-udid-here"
xcodebuild test \
  -workspace myreadermobile.xcworkspace \
  -scheme MyReaderRustComponents-Unit-Tests \
  -destination "platform=iOS Simulator,id=$RUST_COMPONENTS_SIMULATOR_UDID"

# Compile the Android instrumentation tests.
cd my-reader-mobile/android
ANDROID_HOME=/path/to/android-sdk \
  ./gradlew \
  :myreader-rust-components:assembleDebugAndroidTest

# Run them when an emulator or device is connected.
ANDROID_HOME=/path/to/android-sdk \
  ./gradlew \
  :myreader-rust-components:connectedDebugAndroidTest
```
