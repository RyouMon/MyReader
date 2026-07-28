use std::{env, path::Path};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let path = env::args_os()
        .nth(1)
        .ok_or("usage: migrate_database <database-path>")?;
    my_reader_core::api::migrate_library_database(Path::new(&path)).await?;
    Ok(())
}
