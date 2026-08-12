//! Integration-test binary for the Tauri command layer.
//!
//! All tests under `src-tauri/tests/` live in this single compilation unit. Sub-files are
//! reached via `mod` declarations from here (cargo does NOT auto-discover files inside
//! `tests/<subdir>/`), keeping link cost to one binary instead of one-per-file.
//!
//! Layout mirrors `src/commands/`:
//!
//! - `common/`   — shared fixtures (`TestApp` builder, IPC invocation helpers, config seeding)
//! - `commands/` — one `*_test.rs` per file under `src/commands/`
//!
//! Privacy policy: only command-layer / cross-module tests live here. Private-helper unit
//! tests stay inline as `#[cfg(test)] mod tests` in their source file — see
//! `.agents/rules/tauri-testing-strategy.md`.
//!
//! Windows note: `tauri::test::mock_app()` triggers `STATUS_ENTRYPOINT_NOT_FOUND` from
//! integration-test binaries on native Windows (tauri-apps/tauri#13419). Run in WSL:
//!
//! ```sh
//! cd my-reader/src-tauri && cargo test --test integration
//! ```

mod commands;
mod common;
mod configuration;
mod services;
