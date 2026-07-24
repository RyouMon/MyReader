use std::time::Duration;

use opendal::layers::RetryLayer;
use opendal::services::Onedrive;
use opendal::Operator;

use crate::error::AppError;

pub fn build_operator(access_token: &str, root_path: Option<&str>) -> Result<Operator, AppError> {
    let mut builder = Onedrive::default().access_token(access_token);
    if let Some(root) = root_path.filter(|p| !p.trim().is_empty()) {
        builder = builder.root(root);
    }
    let op = Operator::new(builder)
        .map_err(|e| AppError::Sync(format!("Failed to create OneDrive operator: {e}")))?
        .layer(
            RetryLayer::new()
                .with_min_delay(Duration::from_millis(500))
                .with_max_delay(Duration::from_secs(2))
                .with_max_times(3)
                .with_jitter(),
        )
        .finish();
    Ok(op)
}
