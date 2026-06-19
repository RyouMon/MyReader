//! WebDAV remote backend. `endpoint` looks like `https://host/dav`,
//! and `root_path` is relative to that endpoint.

use opendal::{services, Operator};

use crate::auth::credentials;
use crate::error::AppError;
use crate::utils::pipe::Pipe;

pub fn build_operator(
    endpoint: &str,
    username: &str,
    credential_account: &Option<String>,
    inline_password: &Option<String>,
    root_path: &Option<String>,
) -> Result<Operator, AppError> {
    let password = resolve_webdav_password(inline_password, credential_account)?;
    let mut builder = services::Webdav::default()
        .endpoint(endpoint.trim())
        .username(username.trim())
        .password(password.trim());
    if let Some(root) = root_path.as_ref().filter(|p| !p.trim().is_empty()) {
        builder = builder.root(root);
    } else {
        builder = builder.root("/");
    }
    Operator::new(builder)
        .map_err(|err| AppError::Config(format!("初始化 WebDAV Operator 失败: {err}")))?
        .finish()
        .pipe(Ok)
}

fn resolve_webdav_password(
    inline: &Option<String>,
    account: &Option<String>,
) -> Result<String, AppError> {
    if let Some(pw) = inline.as_ref() {
        let trimmed = pw.trim();
        if !trimmed.is_empty() {
            return Ok(trimmed.to_string());
        }
    }
    if let Some(acc) = account.as_ref().filter(|s| !s.trim().is_empty()) {
        return credentials::read_webdav_password(acc.trim())?.ok_or_else(|| {
            AppError::Config("系统钥匙串未找到对应 WebDAV 密码，请在设置页重新保存".into())
        });
    }
    Err(AppError::Config(
        "缺少 WebDAV 密码（inline_password / credential_account 均为空）".into(),
    ))
}
