use std::{fs, io::Write, path::Path};

use tempfile::NamedTempFile;

use crate::{models::AppConfig, CoreError};

pub(crate) fn load(path: &Path) -> Result<Option<AppConfig>, CoreError> {
    if !path.exists() {
        return Ok(None);
    }

    let json = fs::read_to_string(path)?;
    Ok(Some(serde_json::from_str(&json)?))
}

pub(crate) fn save(path: &Path, config: &AppConfig) -> Result<(), CoreError> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }

    let parent = path.parent().unwrap_or_else(|| Path::new("."));
    let mut temporary = NamedTempFile::new_in(parent)?;
    temporary.write_all(&serde_json::to_vec_pretty(config)?)?;
    temporary.as_file_mut().sync_all()?;
    temporary.persist(path).map_err(|error| error.error)?;
    Ok(())
}
