use opendal::Operator;
use opendal::services::Onedrive;

use crate::error::AppError;

pub fn build_operator(access_token: &str, root_path: Option<&str>) -> Result<Operator, AppError> {
    let mut builder = Onedrive::default().access_token(access_token);
    if let Some(root) = root_path.filter(|p| !p.trim().is_empty()) {
        builder = builder.root(root);
    }
    let op = Operator::new(builder)
        .map_err(|e| AppError::Sync(format!("Failed to create OneDrive operator: {e}")))?
        .finish();
    Ok(op)
}
