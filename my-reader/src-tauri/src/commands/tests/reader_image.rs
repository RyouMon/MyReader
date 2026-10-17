use super::*;

#[test]
fn file_picker_cancellation_is_not_a_save_and_selection_preserves_the_bytes() {
    assert_eq!(finish_image_save(None, b"original").unwrap(), None);
    let root = tempfile::tempdir().unwrap();
    let path = root.path().join("Author-Book-7.jpg");
    assert_eq!(
        finish_image_save(
            Some(tauri_plugin_dialog::FilePath::Path(path.clone())),
            b"original"
        )
        .unwrap()
        .as_deref(),
        Some("saved")
    );
    assert_eq!(std::fs::read(path).unwrap(), b"original");
    assert!(finish_image_save(
        Some(tauri_plugin_dialog::FilePath::Url(
            "https://example.com/image.jpg".parse().unwrap()
        )),
        b"original"
    )
    .is_err());
}

#[test]
fn share_cache_expires_old_exports_without_deleting_recent_attachments() {
    let root = tempfile::tempdir().unwrap();
    let old = write_share_file(root.path(), "old.jpg", b"old").unwrap();
    let recent = write_share_file(root.path(), "recent.jpg", b"recent").unwrap();
    let mut options = std::fs::OpenOptions::new();
    options.read(true);
    #[cfg(windows)]
    {
        use std::os::windows::fs::OpenOptionsExt;
        // FILE_WRITE_ATTRIBUTES and FILE_FLAG_BACKUP_SEMANTICS for directory timestamps.
        options.access_mode(0x100).custom_flags(0x02000000);
    }
    let directory = options.open(Path::new(&old).parent().unwrap()).unwrap();
    directory
        .set_times(
            std::fs::FileTimes::new()
                .set_modified(std::time::SystemTime::now() - Duration::from_secs(90_000)),
        )
        .unwrap();
    drop(directory);
    write_share_file(root.path(), "new.jpg", b"new").unwrap();
    assert!(!Path::new(&old).exists());
    assert_eq!(std::fs::read(recent).unwrap(), b"recent");
}

#[test]
fn sharing_preserves_original_bytes_and_separates_same_named_images() {
    let root = tempfile::tempdir().unwrap();
    let first = write_share_file(root.path(), "插图.jpg", b"original JPEG bytes").unwrap();
    let second = write_share_file(root.path(), "插图.jpg", b"second image").unwrap();
    assert_ne!(first, second);
    assert_eq!(std::fs::read(first).unwrap(), b"original JPEG bytes");
    assert_eq!(std::fs::read(second).unwrap(), b"second image");
}

#[test]
fn saving_replaces_the_destination_atomically_without_reencoding() {
    let root = tempfile::tempdir().unwrap();
    let destination = root.path().join("Author-Book-3.jpg");
    std::fs::write(&destination, b"old").unwrap();
    let bytes = [0xff, 0xd8, 0x00, 0xfe, 0xff, 0xd9];
    save_image(&destination, &bytes).unwrap();
    assert_eq!(std::fs::read(&destination).unwrap(), bytes);
    assert_eq!(std::fs::read_dir(root.path()).unwrap().count(), 1);
}

#[test]
fn failed_saves_do_not_replace_a_directory_or_leave_partial_files() {
    let root = tempfile::tempdir().unwrap();
    let destination = root.path().join("existing-directory");
    std::fs::create_dir(&destination).unwrap();
    assert!(save_image(&destination, b"bytes").is_err());
    assert!(destination.is_dir());
    assert_eq!(std::fs::read_dir(root.path()).unwrap().count(), 1);
    assert!(save_image(&root.path().join("missing/image.png"), b"bytes").is_err());
}

#[test]
fn resource_names_cannot_escape_the_export_directory() {
    let root = tempfile::tempdir().unwrap();
    let exported = write_share_file(root.path(), "../../cover.jpg", b"image").unwrap();
    let path = Path::new(&exported);
    assert_eq!(path.parent().unwrap().parent().unwrap(), root.path());
    assert_eq!(safe_name("..."), "image.png");
}
