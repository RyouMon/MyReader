//! 系统凭据存储封装，复用 `keyring` crate v3。
//!
//! 历史实现位于 [`crate::commands`]，其中的 `save_webdav_password` / `delete_webdav_password`
//! 是私有函数。新同步引擎需要在多个模块内复用凭据读写，因此将其迁移到本模块并提升到
//! `pub(crate)`，commands 层改为薄封装，避免重复实现与前后不一致。

use keyring::{Entry, Error as KeyringError};

use crate::error::AppError;

/// keyring 中 WebDAV 凭据的 service 标识；首次引入于初始版本，不能随意更改，
/// 否则历史用户在系统钥匙串中的密码将无法被读取。
pub(crate) const WEBDAV_KEYRING_SERVICE: &str = "com.myreader.webdav";

/// 将数据源 id 映射为 keyring account 名称。
pub(crate) fn webdav_password_account(data_source_id: &str) -> String {
    format!("webdav-password-{data_source_id}")
}

/// 保存（覆盖）WebDAV 密码到系统凭据库。
pub(crate) fn save_webdav_password(account: &str, password: &str) -> Result<(), AppError> {
    let entry = Entry::new(WEBDAV_KEYRING_SERVICE, account)
        .map_err(|err| AppError::Config(format!("创建凭据项失败: {err}")))?;
    entry
        .set_password(password)
        .map_err(|err| AppError::Config(format!("保存系统凭据失败: {err}")))?;
    Ok(())
}

/// 从系统凭据库读取 WebDAV 密码；若不存在返回 `Ok(None)`。
pub(crate) fn read_webdav_password(account: &str) -> Result<Option<String>, AppError> {
    let entry = Entry::new(WEBDAV_KEYRING_SERVICE, account)
        .map_err(|err| AppError::Config(format!("创建凭据项失败: {err}")))?;
    match entry.get_password() {
        Ok(secret) => Ok(Some(secret)),
        Err(KeyringError::NoEntry) => Ok(None),
        Err(err) => Err(AppError::Config(format!("读取系统凭据失败: {err}"))),
    }
}

/// 从系统凭据库删除 WebDAV 密码；若不存在视为成功。
pub(crate) fn delete_webdav_password(account: &str) -> Result<(), AppError> {
    let entry = Entry::new(WEBDAV_KEYRING_SERVICE, account)
        .map_err(|err| AppError::Config(format!("创建凭据项失败: {err}")))?;
    match entry.delete_credential() {
        Ok(()) | Err(KeyringError::NoEntry) => Ok(()),
        Err(err) => Err(AppError::Config(format!("删除系统凭据失败: {err}"))),
    }
}
