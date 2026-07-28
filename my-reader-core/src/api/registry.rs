use std::path::Path;

use crate::{
    models::{DataSource, DeviceRegistry, Library},
    services, CoreError,
};

pub fn load_or_initialize(
    path: &Path,
    legacy: Option<DeviceRegistry>,
) -> Result<DeviceRegistry, CoreError> {
    services::registry::load_or_initialize(path, legacy)
}

pub fn upsert_data_source(path: &Path, source: DataSource) -> Result<DeviceRegistry, CoreError> {
    services::registry::upsert_data_source(path, source)
}

pub fn prepare_data_source(source: DataSource) -> Result<DataSource, CoreError> {
    services::registry::prepare_data_source(source)
}

pub fn ensure_data_source_can_upsert(path: &Path, source: &DataSource) -> Result<(), CoreError> {
    services::registry::ensure_data_source_can_upsert(path, source)
}

pub fn add_local_data_source(
    path: &Path,
    name: &str,
    root_path: &str,
) -> Result<DeviceRegistry, CoreError> {
    services::registry::add_local_data_source(path, name, root_path)
}

pub fn remove_data_source(path: &Path, id: &str) -> Result<DeviceRegistry, CoreError> {
    services::registry::remove_data_source(path, id)
}

pub fn register_library(path: &Path, library: Library) -> Result<DeviceRegistry, CoreError> {
    services::registry::register_library(path, library)
}

pub fn ensure_library_can_register(path: &Path, library: &Library) -> Result<(), CoreError> {
    services::registry::ensure_library_can_register(path, library)
}

pub fn replace_library(path: &Path, library: Library) -> Result<DeviceRegistry, CoreError> {
    services::registry::replace_library(path, library)
}

pub fn remove_library(path: &Path, id: &str) -> Result<DeviceRegistry, CoreError> {
    services::registry::remove_library(path, id)
}

pub fn switch_library(path: &Path, id: &str) -> Result<DeviceRegistry, CoreError> {
    services::registry::switch_library(path, id)
}
