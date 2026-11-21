mod bridge;
mod source;
mod text;
mod webpub;

use crate::CoreError;
use sha2::{Digest, Sha256};
use std::{
    io::Read,
    path::{Path, PathBuf},
};

pub struct PreparedPublication {
    pub directory: PathBuf,
    pub parser_url: Option<String>,
}

fn invalid(reason: impl std::fmt::Display) -> CoreError {
    CoreError::DataIntegrity(format!("PUBLICATION_FORMAT: {reason}"))
}

pub async fn prepare(
    source: &Path,
    format: &str,
    cache: &Path,
) -> Result<PreparedPublication, CoreError> {
    let path = source.to_owned();
    let format = format.to_ascii_uppercase();
    let cache = cache.to_owned();
    let (directory, pending) = tokio::task::spawn_blocking(move || {
        let mut bytes = Vec::new();
        let file = std::fs::File::open(&path)?;
        if file.metadata()?.len() > webpub::LIMIT as u64 {
            return Err(invalid("FILE_TOO_LARGE"));
        }
        file.take(webpub::LIMIT as u64 + 1)
            .read_to_end(&mut bytes)?;
        if bytes.len() > webpub::LIMIT {
            return Err(invalid("FILE_TOO_LARGE"));
        }
        let digest = format!("{:x}", Sha256::digest(&bytes));
        let title = path
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("Book")
            .to_owned();
        let key = format!(
            "{:x}",
            Sha256::digest(format!(
                "rpf-1/{}/{format}/{digest}/{title}",
                bridge::revision()
            ))
        );
        let directory = cache.join(key);
        if webpub::cached(&directory) {
            return Ok((directory, None));
        }
        let input = source::Input::open(&format, bytes)?;
        let package = webpub::Package::new(&directory, &digest, title.clone())?;
        if matches!(input.kind, "text" | "markdown") {
            text::write(
                package,
                &input.files[&input.entry],
                input.kind == "markdown",
                &title,
            )?;
            Ok((directory, None))
        } else {
            Ok((directory, Some((input, package))))
        }
    })
    .await
    .map_err(|e| invalid(e.to_string()))??;
    let parser_url = match pending {
        Some((input, package)) => Some(bridge::start(input, package).await?),
        None => None,
    };
    Ok(PreparedPublication {
        directory,
        parser_url,
    })
}

#[cfg(test)]
mod tests;
