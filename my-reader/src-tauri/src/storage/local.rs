//! Local direct backend: the path is treated as the source of truth.
//! No manifest is generated and no network transfer occurs.

use opendal::{services, Operator};

use crate::error::AppError;
use crate::utils::pipe::Pipe;

pub fn build_operator(root: &str) -> Result<Operator, AppError> {
    let builder = services::Fs::default().root(root);
    Operator::new(builder)
        .map_err(|err| AppError::Config(format!("初始化本地 Operator 失败: {err}")))?
        .finish()
        .pipe(Ok)
}
