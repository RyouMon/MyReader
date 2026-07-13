use std::fs;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};

use tracing::info;
use zip::ZipArchive;

use crate::constants::path::{LIBRARIES_DIR_NAME, MYREADER_LIBRARY_DIR_NAME};
use crate::error::AppError;

pub const MISSING_COVER_MARKERS_DIR_NAME: &str = "missing-covers";
pub const MISSING_COVER_MARKER_EXTENSION: &str = "missing";

pub fn sanitize_key_part(input: &str) -> String {
    input
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() || ch == '-' || ch == '_' {
                ch
            } else {
                '-'
            }
        })
        .collect()
}

pub fn reader_cache_root() -> PathBuf {
    std::env::temp_dir().join("myreader")
}

pub fn reader_cache_extracted_root() -> PathBuf {
    reader_cache_root().join("extracted")
}

pub fn ensure_reader_cache_dirs() -> Result<(), AppError> {
    fs::create_dir_all(reader_cache_extracted_root())?;
    Ok(())
}

pub fn build_archive_cache_key(library_id: &str, book_id: i64, format: &str) -> String {
    format!(
        "{}-{}-{}",
        sanitize_key_part(library_id),
        book_id,
        sanitize_key_part(&format.to_lowercase())
    )
}

pub fn clear_library_container_dir(app_data_dir: &Path, library_id: &str) -> Result<(), AppError> {
    let container = app_data_dir.join(LIBRARIES_DIR_NAME).join(library_id);
    if container.exists() {
        std::fs::remove_dir_all(&container)?;
    }
    Ok(())
}

pub fn library_missing_cover_markers_dir(app_data_dir: &Path, library_id: &str) -> PathBuf {
    app_data_dir
        .join(LIBRARIES_DIR_NAME)
        .join(library_id)
        .join(MYREADER_LIBRARY_DIR_NAME)
        .join(MISSING_COVER_MARKERS_DIR_NAME)
}

pub fn missing_cover_marker_path(
    app_data_dir: &Path,
    library_id: &str,
    remote_path: &str,
) -> PathBuf {
    let hash = blake3::hash(remote_path.as_bytes()).to_hex().to_string();
    library_missing_cover_markers_dir(app_data_dir, library_id)
        .join(format!("{hash}.{MISSING_COVER_MARKER_EXTENSION}"))
}

pub fn clear_library_missing_cover_markers(
    app_data_dir: &Path,
    library_id: &str,
) -> Result<(), AppError> {
    let marker_store = library_missing_cover_markers_dir(app_data_dir, library_id);
    if !marker_store.exists() {
        return Ok(());
    }

    remove_missing_cover_marker_store(&marker_store)?;
    info!(
        "Removed missing cover marker store. library id: \"{}\", path: \"{}\"",
        library_id,
        marker_store.display()
    );

    Ok(())
}

fn remove_missing_cover_marker_store(path: &Path) -> Result<(), AppError> {
    if path.is_dir() {
        fs::remove_dir_all(path)?;
    } else {
        fs::remove_file(path)?;
    }
    Ok(())
}

pub async fn write_missing_cover_marker(
    marker_file: &Path,
    remote_path: &str,
) -> Result<(), AppError> {
    if let Some(parent) = marker_file.parent() {
        tokio::fs::create_dir_all(parent)
            .await
            .map_err(|e| AppError::Config(format!("COVER_MARKER_DIR_FAILED: {e}")))?;
    }
    tokio::fs::write(marker_file, remote_path.as_bytes())
        .await
        .map_err(|e| AppError::Config(format!("MISSING_COVER_MARKER_WRITE_FAILED: {e}")))?;

    info!(
        "Cached missing remote cover. remote path: \"{}\", marker: \"{}\"",
        remote_path,
        marker_file.display()
    );
    Ok(())
}

pub fn clear_library_cache_files(library_id: &str) -> Result<(), AppError> {
    let root = reader_cache_extracted_root();
    if !root.exists() {
        return Ok(());
    }
    let prefix = format!("{}-", sanitize_key_part(library_id));
    for entry in fs::read_dir(root)? {
        let entry = entry?;
        let path = entry.path();
        let Some(name) = path.file_name().and_then(|x| x.to_str()) else {
            continue;
        };
        if !name.starts_with(&prefix) {
            continue;
        }
        if path.is_dir() {
            fs::remove_dir_all(path)?;
        } else {
            fs::remove_file(path)?;
        }
    }
    Ok(())
}

pub fn clear_orphaned_library_cache_files(
    library_id: &str,
    valid_book_ids: &[i64],
) -> Result<(), AppError> {
    let root = reader_cache_extracted_root();
    if !root.exists() {
        return Ok(());
    }
    let prefix = format!("{}-", sanitize_key_part(library_id));
    let valid_set: std::collections::HashSet<i64> = valid_book_ids.iter().copied().collect();
    for entry in fs::read_dir(root)? {
        let entry = entry?;
        let path = entry.path();
        let Some(name) = path.file_name().and_then(|x| x.to_str()) else {
            continue;
        };
        if !name.starts_with(&prefix) {
            continue;
        }
        let remainder = &name[prefix.len()..];
        let book_id_str: String = remainder.chars().take_while(char::is_ascii_digit).collect();
        if book_id_str.is_empty() {
            continue;
        }
        if let Ok(book_id) = book_id_str.parse::<i64>() {
            if !valid_set.contains(&book_id) {
                if path.is_dir() {
                    fs::remove_dir_all(&path)?;
                } else {
                    fs::remove_file(&path)?;
                }
                info!(
                    "Removed orphaned cache file for deleted book. library id: \"{}\", book id: {}, path: \"{}\"",
                    library_id,
                    book_id,
                    path.display()
                );
            }
        }
    }
    Ok(())
}

pub fn extract_zip_to_dir(zip_path: &Path, output_dir: &Path) -> Result<Vec<String>, AppError> {
    let file = fs::File::open(zip_path)?;
    let mut archive = ZipArchive::new(file)?;
    let mut extracted_entries: Vec<String> = Vec::new();

    for i in 0..archive.len() {
        let mut entry = archive.by_index(i)?;
        let Some(enclosed) = entry.enclosed_name() else {
            continue;
        };
        let rel_path = enclosed.to_string_lossy().replace('\\', "/");
        let out_path = output_dir.join(enclosed);
        if entry.is_dir() {
            fs::create_dir_all(&out_path)?;
            continue;
        }
        if let Some(parent) = out_path.parent() {
            fs::create_dir_all(parent)?;
        }
        let mut out_file = fs::File::create(&out_path)?;
        let mut bytes = Vec::new();
        entry.read_to_end(&mut bytes)?;
        out_file.write_all(&bytes)?;
        extracted_entries.push(rel_path);
    }

    Ok(extracted_entries)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn library_container(app_data_dir: &Path, library_id: &str) -> PathBuf {
        app_data_dir.join(LIBRARIES_DIR_NAME).join(library_id)
    }

    #[test]
    fn library_missing_cover_markers_dir_should_use_single_library_level_store() {
        let app_data = PathBuf::from("/app-data");

        assert_eq!(
            library_missing_cover_markers_dir(&app_data, "lib-remote"),
            PathBuf::from("/app-data")
                .join("libraries")
                .join("lib-remote")
                .join(".myreader")
                .join("missing-covers")
        );
    }

    #[test]
    fn missing_cover_marker_path_should_hash_remote_path_inside_marker_store() {
        let app_data = tempfile::tempdir().unwrap();
        let remote_path = "Remote Library/Author/Book/cover.jpg";
        let expected_hash = blake3::hash(remote_path.as_bytes()).to_hex().to_string();

        let marker = missing_cover_marker_path(app_data.path(), "lib-remote", remote_path);

        assert_eq!(
            marker,
            library_missing_cover_markers_dir(app_data.path(), "lib-remote")
                .join(format!("{expected_hash}.missing"))
        );
    }

    #[test]
    fn clear_library_missing_cover_markers_should_noop_when_container_is_missing() {
        let app_data = tempfile::tempdir().unwrap();

        clear_library_missing_cover_markers(app_data.path(), "lib-missing").unwrap();

        assert!(!library_container(app_data.path(), "lib-missing").exists());
    }

    #[test]
    fn clear_library_missing_cover_markers_should_remove_marker_store_only() {
        let app_data = tempfile::tempdir().unwrap();
        let book_dir = library_container(app_data.path(), "lib-remote")
            .join("Author")
            .join("Book");
        let marker_store = library_missing_cover_markers_dir(app_data.path(), "lib-remote");
        let marker = marker_store.join("abc.missing");
        let nested_marker = marker_store.join("nested").join("def.missing");
        let cover = book_dir.join("cover.jpg");
        let old_scattered_marker = book_dir.join("cover.missing");

        fs::create_dir_all(&book_dir).unwrap();
        fs::create_dir_all(marker.parent().unwrap()).unwrap();
        fs::create_dir_all(nested_marker.parent().unwrap()).unwrap();
        fs::write(&marker, b"missing").unwrap();
        fs::write(&nested_marker, b"nested missing").unwrap();
        fs::write(&cover, b"cover").unwrap();
        fs::write(&old_scattered_marker, b"old marker").unwrap();

        clear_library_missing_cover_markers(app_data.path(), "lib-remote").unwrap();

        assert!(!marker_store.exists());
        assert!(cover.exists());
        assert!(old_scattered_marker.exists());
    }

    #[test]
    fn clear_library_missing_cover_markers_should_remove_file_at_marker_store_path() {
        let app_data = tempfile::tempdir().unwrap();
        let marker_store = library_missing_cover_markers_dir(app_data.path(), "lib-remote");
        fs::create_dir_all(marker_store.parent().unwrap()).unwrap();
        fs::write(&marker_store, b"not a directory").unwrap();

        clear_library_missing_cover_markers(app_data.path(), "lib-remote").unwrap();

        assert!(!marker_store.exists());
    }

    #[test]
    fn remove_missing_cover_marker_store_should_delete_directory() {
        let app_data = tempfile::tempdir().unwrap();
        let marker_store = app_data.path().join(MISSING_COVER_MARKERS_DIR_NAME);
        fs::create_dir_all(&marker_store).unwrap();
        fs::write(marker_store.join("abc.missing"), b"missing").unwrap();

        remove_missing_cover_marker_store(&marker_store).unwrap();

        assert!(!marker_store.exists());
    }

    #[test]
    fn remove_missing_cover_marker_store_should_delete_file() {
        let app_data = tempfile::tempdir().unwrap();
        let marker_store = app_data.path().join(MISSING_COVER_MARKERS_DIR_NAME);
        fs::write(&marker_store, b"not a directory").unwrap();

        remove_missing_cover_marker_store(&marker_store).unwrap();

        assert!(!marker_store.exists());
    }

    #[test]
    fn remove_missing_cover_marker_store_should_error_when_path_is_missing() {
        let app_data = tempfile::tempdir().unwrap();
        let marker_store = app_data.path().join(MISSING_COVER_MARKERS_DIR_NAME);

        let err = remove_missing_cover_marker_store(&marker_store).unwrap_err();

        assert!(matches!(err, AppError::Io(_)));
    }

    #[tokio::test]
    async fn write_missing_cover_marker_should_create_parent_and_write_remote_path() {
        let app_data = tempfile::tempdir().unwrap();
        let marker = missing_cover_marker_path(
            app_data.path(),
            "lib-remote",
            "Remote Library/Author/Book/cover.jpg",
        );

        write_missing_cover_marker(&marker, "Remote Library/Author/Book/cover.jpg")
            .await
            .unwrap();

        assert_eq!(
            fs::read_to_string(&marker).unwrap(),
            "Remote Library/Author/Book/cover.jpg"
        );
    }

    #[tokio::test]
    async fn write_missing_cover_marker_should_error_when_parent_cannot_be_created() {
        let app_data = tempfile::tempdir().unwrap();
        let blocker = app_data.path().join("markers");
        fs::write(&blocker, b"not a directory").unwrap();
        let marker = blocker.join("abc.missing");

        let err = write_missing_cover_marker(&marker, "Remote Library/Author/Book/cover.jpg")
            .await
            .unwrap_err();

        assert!(format!("{err}").contains("COVER_MARKER_DIR_FAILED"));
    }

    #[tokio::test]
    async fn write_missing_cover_marker_should_error_when_marker_path_is_directory() {
        let app_data = tempfile::tempdir().unwrap();
        let marker = app_data.path().join("abc.missing");
        fs::create_dir_all(&marker).unwrap();

        let err = write_missing_cover_marker(&marker, "Remote Library/Author/Book/cover.jpg")
            .await
            .unwrap_err();

        assert!(format!("{err}").contains("MISSING_COVER_MARKER_WRITE_FAILED"));
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn write_missing_cover_marker_should_error_when_marker_has_no_parent() {
        let err =
            write_missing_cover_marker(Path::new("/"), "Remote Library/Author/Book/cover.jpg")
                .await
                .unwrap_err();

        assert!(format!("{err}").contains("MISSING_COVER_MARKER_WRITE_FAILED"));
    }
}
