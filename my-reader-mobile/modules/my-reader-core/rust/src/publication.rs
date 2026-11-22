use crate::CoreFfiError;
use std::path::Path;

#[derive(uniffi::Record)]
pub struct PreparedPublication {
    pub package_path: String,
    pub parser_url: Option<String>,
}

#[uniffi::export(async_runtime = "tokio")]
pub async fn publication_prepare(
    source_path: String,
    format: String,
    cache_root: String,
) -> Result<PreparedPublication, CoreFfiError> {
    let result = my_reader_core::api::publication::prepare(
        Path::new(&source_path),
        &format,
        Path::new(&cache_root),
    )
    .await
    .map_err(CoreFfiError::from_core)?;
    Ok(PreparedPublication {
        package_path: result
            .directory
            .join("book.webpub")
            .to_string_lossy()
            .into_owned(),
        parser_url: result.parser_url,
    })
}
