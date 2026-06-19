use std::path::{Path, PathBuf};

use crate::constants::path::{LIBRARIES_DIR_NAME, MYREADER_LIBRARY_DIR_NAME};
use crate::models::LibraryConfig;

/// App container root for a library (`{app_data_dir}/libraries/{library_id}/`).
pub fn library_container_dir(app_data_dir: &Path, library_id: &str) -> PathBuf {
    app_data_dir.join(LIBRARIES_DIR_NAME).join(library_id)
}

/// Calibre tree root: where `metadata.db`, books, and covers live.
/// Local libraries keep original files in place; remote libraries mirror the tree in the container.
pub fn library_root_path(lib: &LibraryConfig, app_data_dir: &Path) -> PathBuf {
    if lib.is_remote() {
        library_container_dir(app_data_dir, &lib.id)
    } else {
        PathBuf::from(&lib.path)
    }
}

/// Root whose `{root}/.myreader/` holds app sidecar data.
/// All sidecars live in the app container for consistency with the mobile implementation.
pub fn library_sidecar_path(lib: &LibraryConfig, app_data_dir: &Path) -> PathBuf {
    library_container_dir(app_data_dir, &lib.id)
}

/// `{library_root}/metadata.db`.
pub fn library_metadata_db_path(lib: &LibraryConfig, app_data_dir: &Path) -> PathBuf {
    library_root_path(lib, app_data_dir).join("metadata.db")
}

/// `{sidecar_root}/.myreader`.
#[allow(dead_code)]
pub fn library_myreader_dir_path(lib: &LibraryConfig, app_data_dir: &Path) -> PathBuf {
    library_sidecar_path(lib, app_data_dir).join(MYREADER_LIBRARY_DIR_NAME)
}

/// `{sidecar_root}/.myreader/myreader.db`.
#[allow(dead_code)]
pub fn library_myreader_db_path(lib: &LibraryConfig, app_data_dir: &Path) -> PathBuf {
    library_myreader_dir_path(lib, app_data_dir).join("myreader.db")
}

/// `{library_root}/{relative_path}` for Calibre book files and covers.
pub fn library_book_file_path(
    lib: &LibraryConfig,
    app_data_dir: &Path,
    relative: &str,
) -> PathBuf {
    library_root_path(lib, app_data_dir).join(relative)
}

#[cfg(test)]
mod tests {
    use std::path::PathBuf;

    use super::*;

    fn local_library() -> LibraryConfig {
        LibraryConfig {
            id: "lib-local".into(),
            name: "Local".into(),
            path: "/users/wen/books".into(),
            source_type: Some("local".into()),
            data_source_id: None,
            source_path: None,
        }
    }

    fn webdav_library() -> LibraryConfig {
        LibraryConfig {
            id: "lib-webdav".into(),
            name: "WebDAV".into(),
            path: "/old/remote-cache/lib-webdav".into(),
            source_type: Some("webdav".into()),
            data_source_id: Some("ds-1".into()),
            source_path: Some("/books".into()),
        }
    }

    fn onedrive_library() -> LibraryConfig {
        LibraryConfig {
            id: "lib-onedrive".into(),
            name: "OneDrive".into(),
            path: "/old/remote-cache/lib-onedrive".into(),
            source_type: Some("onedrive".into()),
            data_source_id: Some("ds-2".into()),
            source_path: Some("/Books".into()),
        }
    }

    #[test]
    fn library_container_dir_should_return_libraries_subdirectory_with_id() {
        let app_data = PathBuf::from("/app-data");
        assert_eq!(
            library_container_dir(&app_data, "lib-1"),
            PathBuf::from("/app-data/libraries/lib-1")
        );
    }

    #[test]
    fn library_root_path_should_use_original_path_for_local_library() {
        let app_data = PathBuf::from("/app-data");
        assert_eq!(
            library_root_path(&local_library(), &app_data),
            PathBuf::from("/users/wen/books")
        );
    }

    #[test]
    fn library_root_path_should_use_container_for_webdav_library() {
        let app_data = PathBuf::from("/app-data");
        assert_eq!(
            library_root_path(&webdav_library(), &app_data),
            PathBuf::from("/app-data/libraries/lib-webdav")
        );
    }

    #[test]
    fn library_root_path_should_use_container_for_onedrive_library() {
        let app_data = PathBuf::from("/app-data");
        assert_eq!(
            library_root_path(&onedrive_library(), &app_data),
            PathBuf::from("/app-data/libraries/lib-onedrive")
        );
    }

    #[test]
    fn library_sidecar_path_should_always_use_container() {
        let app_data = PathBuf::from("/app-data");
        assert_eq!(
            library_sidecar_path(&local_library(), &app_data),
            PathBuf::from("/app-data/libraries/lib-local")
        );
        assert_eq!(
            library_sidecar_path(&webdav_library(), &app_data),
            PathBuf::from("/app-data/libraries/lib-webdav")
        );
    }

    #[test]
    fn library_metadata_db_path_should_use_root_path() {
        let app_data = PathBuf::from("/app-data");
        assert_eq!(
            library_metadata_db_path(&local_library(), &app_data),
            PathBuf::from("/users/wen/books/metadata.db")
        );
        assert_eq!(
            library_metadata_db_path(&webdav_library(), &app_data),
            PathBuf::from("/app-data/libraries/lib-webdav/metadata.db")
        );
    }

    #[test]
    fn library_myreader_db_path_should_use_sidecar_path() {
        let app_data = PathBuf::from("/app-data");
        assert_eq!(
            library_myreader_db_path(&local_library(), &app_data),
            PathBuf::from("/app-data/libraries/lib-local/.myreader/myreader.db")
        );
        assert_eq!(
            library_myreader_db_path(&webdav_library(), &app_data),
            PathBuf::from("/app-data/libraries/lib-webdav/.myreader/myreader.db")
        );
    }

    #[test]
    fn library_book_file_path_should_resolve_under_root_path() {
        let app_data = PathBuf::from("/app-data");
        assert_eq!(
            library_book_file_path(&local_library(), &app_data, "Stephen King/It/cover.jpg"),
            PathBuf::from("/users/wen/books/Stephen King/It/cover.jpg")
        );
        assert_eq!(
            library_book_file_path(
                &webdav_library(),
                &app_data,
                "Stephen King/It/cover.jpg"
            ),
            PathBuf::from("/app-data/libraries/lib-webdav/Stephen King/It/cover.jpg")
        );
    }
}
