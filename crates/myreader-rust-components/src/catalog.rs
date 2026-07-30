use std::path::Path;

use crate::{run_core_async, RustComponentsError};

#[uniffi::export]
pub fn list_book_reading_formats(
    sidecar_root_path: String,
    library_root_path: String,
) -> Result<std::collections::HashMap<String, String>, RustComponentsError> {
    let formats = run_core_async(myreader_core::api::content::list_reading_formats(
        Path::new(&sidecar_root_path),
        Path::new(&library_root_path),
    ))?;
    Ok(formats.into_iter().collect())
}

#[uniffi::export]
pub fn set_book_reading_format(
    sidecar_root_path: String,
    library_root_path: String,
    book_id: i64,
    format: Option<String>,
) -> Result<(), RustComponentsError> {
    run_core_async(myreader_core::api::content::set_reading_format(
        Path::new(&sidecar_root_path),
        Path::new(&library_root_path),
        book_id,
        format.as_deref(),
    ))
}
