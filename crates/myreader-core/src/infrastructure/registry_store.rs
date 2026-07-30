use std::{fs, path::Path};

use crate::{models::DeviceRegistry, CoreError};

pub(crate) fn load(path: &Path) -> Result<Option<DeviceRegistry>, CoreError> {
    if !path.exists() {
        return Ok(None);
    }

    let json = fs::read_to_string(path)?;
    Ok(Some(serde_json::from_str(&json)?))
}

pub(crate) fn save(path: &Path, registry: &DeviceRegistry) -> Result<(), CoreError> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::write(path, serde_json::to_vec_pretty(registry)?)?;
    Ok(())
}
