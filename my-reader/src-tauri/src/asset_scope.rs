//! `convertFileSrc` + `fetch` rely on the `asset` custom protocol and its filesystem scope.
//! Default config allows no paths, so EPUB/CBZ/PDF reads return 403 until we extend the scope.

use std::path::Path;

use tauri::{AppHandle, Manager};

use crate::commands::AppState;

/// Allows the OS temp dir (extracted EPUB/CBZ cache) and every Calibre library root for asset URLs.
pub fn sync_for_reader_libraries(app: &AppHandle) -> tauri::Result<()> {
    let scope = app.asset_protocol_scope();
    scope.allow_directory(std::env::temp_dir(), true)?;
    let state = app.state::<AppState>();
    let config = state.blocking_lock();
    for lib in &config.libraries {
        let p = Path::new(&lib.path);
        if p.is_dir() {
            scope.allow_directory(p, true)?;
        }
    }
    Ok(())
}
