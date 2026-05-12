use std::fs;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

use log::info;
use zip::ZipArchive;

use crate::error::AppError;

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
        let book_id_str: String = remainder.chars().take_while(|c| c.is_ascii_digit()).collect();
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

pub fn collect_cache_files_sorted_oldest() -> Result<Vec<(PathBuf, u64, u128)>, AppError> {
    let mut out: Vec<(PathBuf, u64, u128)> = Vec::new();
    let root = reader_cache_root();
    if !root.exists() {
        return Ok(out);
    }
    let mut stack = vec![root];
    while let Some(dir) = stack.pop() {
        for entry in fs::read_dir(&dir)? {
            let entry = entry?;
            let path = entry.path();
            let meta = entry.metadata()?;
            if meta.is_dir() {
                stack.push(path);
                continue;
            }
            let modified = meta
                .modified()
                .ok()
                .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
                .map(|d| d.as_millis())
                .unwrap_or(0);
            out.push((path, meta.len(), modified));
        }
    }
    out.sort_by_key(|(_, _, modified)| *modified);
    Ok(out)
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
