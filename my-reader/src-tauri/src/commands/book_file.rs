use std::path::Path;

use tauri::{AppHandle, Manager, State};
use tauri_plugin_clipboard_manager::ClipboardExt;
use tauri_plugin_dialog::DialogExt;

use crate::commands::{common, AppState};
use crate::error::AppError;
use crate::services::download_service::DownloadService;

#[tauri::command]
#[specta::specta]
pub async fn copy_book_file_path<R: tauri::Runtime>(
    app: AppHandle<R>,
    state: State<'_, AppState>,
    service: State<'_, DownloadService>,
    library_id: String,
    book_id: i64,
    format: String,
) -> Result<(), AppError> {
    let path = service
        .resolve_available_book_file_path(
            &common::app_data_dir(&app)?,
            &common::config_snapshot(&state),
            &library_id,
            book_id,
            &format,
        )
        .await?;
    app.clipboard()
        .write_text(path.to_string_lossy().into_owned())
        .map_err(|error| AppError::Task(format!("COPY_BOOK_FILE_PATH_FAILED: {error}")))
}

#[tauri::command]
#[specta::specta]
pub async fn reveal_book_file<R: tauri::Runtime>(
    app: AppHandle<R>,
    state: State<'_, AppState>,
    service: State<'_, DownloadService>,
    library_id: String,
    book_id: i64,
    format: String,
) -> Result<(), AppError> {
    let path = service
        .resolve_available_book_file_path(
            &common::app_data_dir(&app)?,
            &common::config_snapshot(&state),
            &library_id,
            book_id,
            &format,
        )
        .await?;
    tauri::async_runtime::spawn_blocking(move || tauri_plugin_opener::reveal_item_in_dir(path))
        .await
        .map_err(|error| AppError::Task(error.to_string()))?
        .map_err(|error| AppError::Task(format!("REVEAL_BOOK_FILE_FAILED: {error}")))
}

#[tauri::command]
#[specta::specta]
pub async fn save_book_file_as<R: tauri::Runtime>(
    app: AppHandle<R>,
    state: State<'_, AppState>,
    service: State<'_, DownloadService>,
    library_id: String,
    book_id: i64,
    format: String,
) -> Result<bool, AppError> {
    let source = service
        .resolve_available_book_file_path(
            &common::app_data_dir(&app)?,
            &common::config_snapshot(&state),
            &library_id,
            book_id,
            &format,
        )
        .await?;
    let file_name = source
        .file_name()
        .ok_or_else(|| AppError::Config("BOOK_FILE_NAME_MISSING".into()))?
        .to_string_lossy()
        .into_owned();
    let mut dialog = app
        .dialog()
        .file()
        .set_file_name(file_name)
        .add_filter(format.to_uppercase(), &[&format.to_lowercase()]);
    if let Some(window) = app.get_webview_window("main") {
        dialog = dialog.set_parent(&window);
    }

    tauri::async_runtime::spawn_blocking(move || {
        let Some(destination) = dialog.blocking_save_file() else {
            return Ok(false);
        };
        let destination = destination
            .into_path()
            .map_err(|error| AppError::Config(error.to_string()))?;
        save_file_copy(&source, &destination)?;
        Ok(true)
    })
    .await
    .map_err(|error| AppError::Task(error.to_string()))?
}

fn save_file_copy(source: &Path, destination: &Path) -> Result<(), AppError> {
    if dunce::canonicalize(destination).ok().as_deref() == Some(source) {
        return Ok(());
    }
    let parent = destination
        .parent()
        .ok_or_else(|| AppError::Config("SAVE_DESTINATION_HAS_NO_PARENT".into()))?;
    let mut input = std::fs::File::open(source)?;
    let mut output = tempfile::NamedTempFile::new_in(parent)?;
    std::io::copy(&mut input, output.as_file_mut())?;
    output.as_file().sync_all()?;
    output.persist(destination).map_err(|error| error.error)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::save_file_copy;

    #[test]
    fn save_copy_should_preserve_source_and_replace_only_destination() {
        let root = tempfile::tempdir().unwrap();
        let source = root.path().join("书籍 & original.epub");
        let destination = root.path().join("另存副本.epub");
        std::fs::write(&source, b"original book contents").unwrap();
        std::fs::write(&destination, b"old export").unwrap();

        save_file_copy(&source, &destination).unwrap();

        assert_eq!(std::fs::read(&source).unwrap(), b"original book contents");
        assert_eq!(
            std::fs::read(&destination).unwrap(),
            b"original book contents"
        );
        assert_eq!(std::fs::read_dir(root.path()).unwrap().count(), 2);
    }

    #[test]
    fn saving_to_source_or_hard_link_should_not_truncate_the_book() {
        let root = tempfile::tempdir().unwrap();
        let source = root.path().join("book.pdf");
        let linked = root.path().join("linked.pdf");
        std::fs::write(&source, b"book contents").unwrap();
        std::fs::hard_link(&source, &linked).unwrap();
        let source = dunce::canonicalize(source).unwrap();

        save_file_copy(&source, &source).unwrap();
        save_file_copy(&source, &linked).unwrap();

        assert_eq!(std::fs::read(source).unwrap(), b"book contents");
        assert_eq!(std::fs::read(linked).unwrap(), b"book contents");
    }

    #[test]
    fn failed_save_should_leave_existing_destination_untouched() {
        let root = tempfile::tempdir().unwrap();
        let destination = root.path().join("existing.epub");
        std::fs::write(&destination, b"existing export").unwrap();

        assert!(save_file_copy(&root.path().join("missing.epub"), &destination).is_err());

        assert_eq!(std::fs::read(destination).unwrap(), b"existing export");
        assert_eq!(std::fs::read_dir(root.path()).unwrap().count(), 1);
    }
}
