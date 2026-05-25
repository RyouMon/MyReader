//! 本地直读后端：应用把该路径视为事实来源，不生成 manifest 也不做网络传输。

use opendal::{services, Operator};

use crate::error::AppError;

use super::Pipe;

pub fn build_operator(root: &str) -> Result<Operator, AppError> {
    let builder = services::Fs::default().root(root);
    Operator::new(builder)
        .map_err(|err| AppError::Config(format!("初始化本地 Operator 失败: {err}")))?
        .finish()
        .pipe(Ok)
}

pub async fn test_backend(root: &str) -> Result<(), AppError> {
    let meta = tokio::fs::metadata(root)
        .await
        .map_err(|err| AppError::Config(format!("本地目录不可读: {root}: {err}")))?;
    if !meta.is_dir() {
        return Err(AppError::Config(format!("路径不是目录: {root}")));
    }
    Ok(())
}