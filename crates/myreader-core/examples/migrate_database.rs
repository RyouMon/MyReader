use std::{env, path::Path};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let path = env::args_os()
        .nth(1)
        .ok_or("usage: migrate_database <database-path>")?;
    myreader_core::database::migrate_database_file(Path::new(&path)).await?;
    Ok(())
}
