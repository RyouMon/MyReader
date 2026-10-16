use super::*;

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
