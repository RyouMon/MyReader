# MyReader Core Mobile Adapter

This Expo module is the mobile adapter for `my-reader-core`. Rust owns the use cases, SQLite
transactions, Automerge document, transport, and scheduler policy. Swift and Kotlin expose only
the contract version plus synchronous and asynchronous transport gateways.

## Source and generated files

- `rust/src/lib.rs` owns runtime initialization and the three stable UniFFI exports.
- `rust/src/transport/` owns the generated request/response contract and delegates to
  `my-reader-core`.
- `src/MyReaderCoreModule.ts`, `ios/MyReaderCoreModule.swift`, and
  `android/src/main/java/com/myreader/core/MyReaderCoreModule.kt` are
  handwritten adapters.
- `ios/generated/` and `android/src/main/java/com/myreader/core/uniffi/` are regenerated
  by `scripts/generate-bindings.sh`.
- Native Rust artifacts are generated under `build/` and must not be committed.

After changing the exported Rust API, run one of:

```bash
# Generate bindings, build the iOS simulator artifact, and check artifact ownership.
./my-reader-mobile/modules/my-reader-core/scripts/verify-native.sh ios

# Generate bindings, build all configured Android ABIs, and check artifact ownership.
./my-reader-mobile/modules/my-reader-core/scripts/verify-native.sh android

# Verify both platforms.
./my-reader-mobile/modules/my-reader-core/scripts/verify-native.sh
```

Run the shared core and FFI tests independently with:

```bash
cargo test -p my-reader-core -p my-reader-core-ffi
```

Measure the Core high-frequency paths with:

```bash
cargo run -p my-reader-core --release --example runtime_baseline -- 1000
```

The reference environment and results are recorded in
[`docs/my-reader-core-runtime-baseline.md`](../../../docs/my-reader-core-runtime-baseline.md).

Run the native runtime smoke tests with:

```bash
# Regenerate the iOS project first when the test-spec scheme is missing, then:
cd my-reader-mobile/ios
pod install
MY_READER_CORE_SIMULATOR_UDID="paste-simulator-udid-here"
xcodebuild test \
  -workspace myreadermobile.xcworkspace \
  -scheme MyReaderCore-Unit-Tests \
  -destination "platform=iOS Simulator,id=$MY_READER_CORE_SIMULATOR_UDID"

# Compile the Android instrumentation tests.
cd my-reader-mobile/android
ANDROID_HOME=/path/to/android-sdk \
  ./gradlew \
  :my-reader-core:assembleDebugAndroidTest

# Run them when an emulator or device is connected.
ANDROID_HOME=/path/to/android-sdk \
  ./gradlew \
  :my-reader-core:connectedDebugAndroidTest
```
