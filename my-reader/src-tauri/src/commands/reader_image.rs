use std::{io::Write, path::Path, time::Duration};

use base64::Engine;
use tauri::{AppHandle, Manager, WebviewWindow};
use tauri_plugin_clipboard_manager::ClipboardExt;
use tauri_plugin_dialog::DialogExt;

use crate::error::AppError;

#[derive(Clone, Debug, serde::Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct ReaderCaptureRect {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

#[derive(serde::Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub enum ReaderImageAction {
    Copy,
    Save,
    PrepareShare,
}

fn safe_name(name: &str) -> String {
    let name: String = name
        .chars()
        .map(|c| {
            if c.is_control() || "/\\:*?\"<>|".contains(c) {
                '_'
            } else {
                c
            }
        })
        .take(180)
        .collect();
    let name = name.trim_matches([' ', '.']);
    if name.is_empty() {
        "image.png".into()
    } else {
        name.into()
    }
}

fn write_share_file(root: &Path, name: &str, bytes: &[u8]) -> Result<String, AppError> {
    std::fs::create_dir_all(root)?;
    // Share targets can read asynchronously after the picker closes.
    for entry in std::fs::read_dir(root)?.flatten() {
        let expired = entry
            .metadata()
            .ok()
            .and_then(|m| m.modified().ok())
            .and_then(|t| t.elapsed().ok())
            .is_some_and(|age| age > Duration::from_secs(86_400));
        if expired {
            let _ = std::fs::remove_dir_all(entry.path());
        }
    }
    let directory = root.join(uuid::Uuid::new_v4().to_string());
    std::fs::create_dir(&directory)?;
    let path = directory.join(safe_name(name));
    std::fs::write(&path, bytes)?;
    Ok(path.to_string_lossy().into_owned())
}

fn save_image(destination: &Path, bytes: &[u8]) -> Result<(), AppError> {
    let parent = destination
        .parent()
        .ok_or_else(|| AppError::Config("INVALID_DESTINATION".into()))?;
    let mut file = tempfile::NamedTempFile::new_in(parent)?;
    file.write_all(bytes)?;
    file.persist(destination).map_err(|e| e.error)?;
    Ok(())
}

fn finish_image_save(
    destination: Option<tauri_plugin_dialog::FilePath>,
    bytes: &[u8],
) -> Result<Option<String>, AppError> {
    let Some(destination) = destination else {
        return Ok(None);
    };
    let destination = destination
        .into_path()
        .map_err(|e| AppError::Config(e.to_string()))?;
    save_image(&destination, bytes)?;
    Ok(Some("saved".into()))
}

#[tauri::command]
#[specta::specta]
pub async fn reader_image_action(
    app: AppHandle,
    window: WebviewWindow,
    action: ReaderImageAction,
    name: String,
    data: Option<String>,
    capture: Option<ReaderCaptureRect>,
) -> Result<Option<String>, AppError> {
    if !cfg!(any(target_os = "macos", target_os = "windows")) {
        return Err(AppError::Config("READER_IMAGE_UNSUPPORTED".into()));
    }
    let bytes = match (data, capture) {
        (Some(data), None) => base64::engine::general_purpose::STANDARD
            .decode(data)
            .map_err(|e| AppError::Config(e.to_string()))?,
        (None, Some(rect)) => super::reader_snapshot::capture(&window, rect)
            .await
            .map_err(AppError::Task)?,
        _ => return Err(AppError::Config("READER_IMAGE_SOURCE_REQUIRED".into())),
    };
    tauri::async_runtime::spawn_blocking(move || match action {
        ReaderImageAction::Copy => {
            let image = image::load_from_memory(&bytes)
                .map_err(|e| AppError::Task(e.to_string()))?
                .into_rgba8();
            app.clipboard()
                .write_image(&tauri::image::Image::new_owned(
                    image.as_raw().clone(),
                    image.width(),
                    image.height(),
                ))
                .map_err(|e| AppError::Task(e.to_string()))?;
            Ok(Some("copied".into()))
        }
        ReaderImageAction::Save => {
            let destination = app
                .dialog()
                .file()
                .set_parent(&window)
                .set_file_name(safe_name(&name))
                .blocking_save_file();
            finish_image_save(destination, &bytes)
        }
        ReaderImageAction::PrepareShare => write_share_file(
            &app.path().app_cache_dir()?.join("reader-shares"),
            &name,
            &bytes,
        )
        .map(Some),
    })
    .await
    .map_err(|e| AppError::Task(e.to_string()))?
}

#[cfg(test)]
#[path = "tests/reader_image.rs"]
mod tests;
