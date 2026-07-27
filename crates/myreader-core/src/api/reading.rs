use std::path::Path;

use crate::{services, CoreError};

pub async fn list_favorite_book_ids(sidecar_root: &Path) -> Result<Vec<i64>, CoreError> {
    services::reading::list_favorite_book_ids(sidecar_root).await
}

pub async fn set_favorite_book(
    sidecar_root: &Path,
    library_root: &Path,
    book_id: i64,
    is_favorite: bool,
    recorded_at_ms: i64,
) -> Result<(), CoreError> {
    services::reading::set_favorite_book(
        sidecar_root,
        library_root,
        book_id,
        is_favorite,
        recorded_at_ms,
    )
    .await
}
