//! Thin wrappers around `tauri::test::get_ipc_response` so test bodies stay one-liner-ish.
//!
//! `invoke_ok::<T>(&app, "cmd", args)` decodes the response into `T`. `invoke_err`
//! returns a `CommandError { kind, message }` ready for assertions — `AppError` itself
//! is `Serialize`-only (no `Deserialize` impl in production code), so we round-trip via
//! its on-wire shape `{ "kind": "...", "message": "..." }`.

use serde::de::DeserializeOwned;
use serde::Deserialize;
use serde_json::Value;
use std::sync::atomic::{AtomicU64, Ordering};

use tauri::ipc::CallbackFn;
use tauri::test::{get_ipc_response, INVOKE_KEY};
use tauri::webview::InvokeRequest;
use tauri::{WebviewUrl, WebviewWindowBuilder};

use super::app::TestApp;

/// Mirror of `error::ErrorKind`'s on-wire shape (`#[serde(tag = "kind", content = "message")]`).
/// Tests use `error.kind` to discriminate variants and `error.message` for `contains(...)`
/// assertions.
#[derive(Debug, Clone, Deserialize)]
pub struct CommandError {
    pub kind: String,
    pub message: String,
}

impl CommandError {
    pub fn is_kind(&self, kind: &str) -> bool {
        self.kind == kind
    }
}

/// Invoke a command and deserialize the success payload into `T`. Panics on error —
/// use `invoke_err` when the test expects a failure.
pub fn invoke_ok<T: DeserializeOwned>(app: &TestApp, cmd: &str, args: Value) -> T {
    match invoke_raw(app, cmd, args) {
        Ok(body) => serde_json::from_value(body)
            .unwrap_or_else(|e| panic!("invoke({cmd}) response deserialize failed: {e}")),
        Err(err) => panic!("invoke({cmd}) expected Ok but got Err: {err:?}"),
    }
}

/// Invoke a command expecting failure; returns the deserialized `CommandError`.
pub fn invoke_err(app: &TestApp, cmd: &str, args: Value) -> CommandError {
    match invoke_raw(app, cmd, args) {
        Ok(body) => panic!("invoke({cmd}) expected Err but got Ok: {body}"),
        Err(err) => err,
    }
}

/// Lower-level helper. Returns `Ok(Value)` for command success and `Err(CommandError)`
/// for command failure. Useful when the test cares about *both* outcomes without
/// panicking.
pub fn invoke_raw(app: &TestApp, cmd: &str, args: Value) -> Result<Value, CommandError> {
    // Use a unique webview label per invocation. `window.destroy()` is best-effort —
    // tauri::test does not synchronously tear the webview down, so reusing "main"
    // panics with `WebviewLabelAlreadyExists` on the second invoke inside one test.
    static LABEL_SEQ: AtomicU64 = AtomicU64::new(0);
    let label = format!("invoke_{}", LABEL_SEQ.fetch_add(1, Ordering::Relaxed));

    let window = WebviewWindowBuilder::new(&app.app, &label, WebviewUrl::default())
        .build()
        .expect("mock webview should build");

    let request = InvokeRequest {
        cmd: cmd.into(),
        callback: CallbackFn(0),
        error: CallbackFn(1),
        url: "http://tauri.localhost".parse().expect("static url parses"),
        body: args.into(),
        headers: Default::default(),
        invoke_key: INVOKE_KEY.to_string(),
    };

    let response = get_ipc_response(&window, request);
    let _ = window.destroy();

    match response {
        Ok(body) => {
            let value: Value = body
                .deserialize()
                .unwrap_or_else(|e| panic!("response body not JSON: {e}"));
            Ok(value)
        }
        Err(serialized) => {
            // `get_ipc_response` returns the serialized error as a `Value` already.
            let value: Value = serialized;
            let err: CommandError = serde_json::from_value(value.clone()).unwrap_or_else(|e| {
                panic!("could not deserialize CommandError from {value}: {e}")
            });
            Err(err)
        }
    }
}
