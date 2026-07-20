use std::{
    env, fs,
    path::{Path, PathBuf},
};

fn main() {
    generate_library_migrations();
    tauri_build::build();
}

fn generate_library_migrations() {
    let manifest_dir = PathBuf::from(env::var_os("CARGO_MANIFEST_DIR").unwrap());
    let drizzle_dir = manifest_dir.join("../../packages/db/drizzle");
    let mut migrations = fs::read_dir(&drizzle_dir)
        .unwrap_or_else(|error| {
            panic!(
                "failed to read Drizzle migrations at {}: {error}",
                drizzle_dir.display()
            )
        })
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .filter(|path| path.extension().is_some_and(|extension| extension == "sql"))
        .collect::<Vec<_>>();
    migrations.sort();

    assert!(
        !migrations.is_empty(),
        "no Drizzle SQL migrations found at {}",
        drizzle_dir.display()
    );

    println!("cargo:rerun-if-changed={}", drizzle_dir.display());

    let mut generated = String::from("vec![\n");
    for path in migrations {
        let name = migration_name(&path);
        println!("cargo:rerun-if-changed={}", path.display());
        generated.push_str(&format!(
            "    Box::new(DrizzleMigration::new({name:?}, include_str!({path:?}))),\n",
            path = path.to_string_lossy(),
        ));
    }
    generated.push_str("]\n");

    let output =
        PathBuf::from(env::var_os("OUT_DIR").unwrap()).join("library_drizzle_migrations.rs");
    fs::write(&output, generated)
        .unwrap_or_else(|error| panic!("failed to write {}: {error}", output.display()));
}

fn migration_name(path: &Path) -> &str {
    let name = path
        .file_stem()
        .and_then(|name| name.to_str())
        .unwrap_or_else(|| panic!("invalid Drizzle migration filename: {}", path.display()));
    let bytes = name.as_bytes();
    assert!(
        bytes.len() > 5
            && bytes[..4].iter().all(u8::is_ascii_digit)
            && bytes[4] == b'_'
            && bytes
                .iter()
                .all(|byte| byte.is_ascii_alphanumeric() || *byte == b'_'),
        "Drizzle migration filename must be an ordered ASCII identifier: {}",
        path.display()
    );
    name
}
