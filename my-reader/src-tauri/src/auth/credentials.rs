//! Credential storage wrapper around the `keyring` crate v3.
//!
//! Commands use this module to save and delete WebDAV passwords and OneDrive refresh tokens.

use std::sync::Arc;

use keyring::{Entry, Error as KeyringError};

use crate::error::AppError;

const WEBDAV_KEYRING_SERVICE: &str = "com.myreader.webdav";
const ONEDRIVE_KEYRING_SERVICE: &str = "com.myreader.onedrive";

/// Credential type used to unify keyring operations.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Service {
    Webdav,
    Onedrive,
}

impl Service {
    fn keyring_service(&self) -> &'static str {
        match self {
            Service::Webdav => WEBDAV_KEYRING_SERVICE,
            Service::Onedrive => ONEDRIVE_KEYRING_SERVICE,
        }
    }

    fn label(&self) -> &'static str {
        match self {
            Service::Webdav => "WebDAV 密码",
            Service::Onedrive => "OneDrive refresh token",
        }
    }
}

/// Low-level credential storage abstraction.
///
/// Abstracting the concrete keyring implementation lets unit tests use a memory backend
/// and avoids polluting the system credential store.
pub trait CredentialBackend: Send + Sync {
    fn set_password(&self, service: &str, account: &str, secret: &str) -> Result<(), AppError>;
    fn get_password(&self, service: &str, account: &str) -> Result<Option<String>, AppError>;
    fn delete_credential(&self, service: &str, account: &str) -> Result<(), AppError>;
}

/// Credential backend backed by the system keyring.
pub struct KeyringBackend;

impl CredentialBackend for KeyringBackend {
    fn set_password(&self, service: &str, account: &str, secret: &str) -> Result<(), AppError> {
        open_entry(service, account)?
            .set_password(secret)
            .map_err(|err| AppError::Credential(format!("保存系统凭据失败: {err}")))
    }

    fn get_password(&self, service: &str, account: &str) -> Result<Option<String>, AppError> {
        match open_entry(service, account)?.get_password() {
            Ok(secret) => Ok(Some(secret)),
            Err(KeyringError::NoEntry) => Ok(None),
            Err(err) => Err(AppError::Credential(format!("读取系统凭据失败: {err}"))),
        }
    }

    fn delete_credential(&self, service: &str, account: &str) -> Result<(), AppError> {
        match open_entry(service, account)?.delete_credential() {
            Ok(()) | Err(KeyringError::NoEntry) => Ok(()),
            Err(err) => Err(AppError::Credential(format!("删除系统凭据失败: {err}"))),
        }
    }
}

fn open_entry(service: &str, account: &str) -> Result<Entry, AppError> {
    Entry::new(service, account)
        .map_err(|err| AppError::Credential(format!("创建凭据项失败: {err}")))
}

/// Credential storage entry point.
pub struct CredentialStore {
    backend: Arc<dyn CredentialBackend>,
}

impl CredentialStore {
    /// Creates a store backed by the system keyring.
    pub fn keyring() -> Self {
        Self {
            backend: Arc::new(KeyringBackend),
        }
    }

    /// Creates a store backed by memory, for tests only.
    #[cfg(test)]
    pub fn memory() -> Self {
        Self {
            backend: Arc::new(test_support::MemoryBackend::default()),
        }
    }

    pub fn save(&self, service: Service, account: &str, secret: &str) -> Result<(), AppError> {
        self.backend
            .set_password(service.keyring_service(), account, secret)
            .map_err(|err| AppError::Credential(format!("保存{}失败: {err}", service.label())))
    }

    pub fn read(&self, service: Service, account: &str) -> Result<Option<String>, AppError> {
        self.backend
            .get_password(service.keyring_service(), account)
            .map_err(|err| AppError::Credential(format!("读取{}失败: {err}", service.label())))
    }

    pub fn delete(&self, service: Service, account: &str) -> Result<(), AppError> {
        self.backend
            .delete_credential(service.keyring_service(), account)
            .map_err(|err| AppError::Credential(format!("删除{}失败: {err}", service.label())))
    }
}

fn store() -> CredentialStore {
    #[cfg(test)]
    if let Some(backend) = test_support::get_backend() {
        return CredentialStore { backend };
    }
    CredentialStore::keyring()
}

pub fn webdav_password_account(data_source_id: &str) -> String {
    format!("webdav-password-{data_source_id}")
}

pub fn save_webdav_password(account: &str, password: &str) -> Result<(), AppError> {
    store().save(Service::Webdav, account, password)
}

pub fn read_webdav_password(account: &str) -> Result<Option<String>, AppError> {
    store().read(Service::Webdav, account)
}

pub fn delete_webdav_password(account: &str) -> Result<(), AppError> {
    store().delete(Service::Webdav, account)
}

pub fn onedrive_refresh_token_account(data_source_id: &str) -> String {
    format!("onedriveres-{data_source_id}")
}

pub fn save_onedrive_refresh_token(account: &str, token: &str) -> Result<(), AppError> {
    store().save(Service::Onedrive, account, token)
}

pub fn read_onedrive_refresh_token(data_source_id: &str) -> Result<Option<String>, AppError> {
    let account = onedrive_refresh_token_account(data_source_id);
    store().read(Service::Onedrive, &account)
}

pub fn delete_onedrive_refresh_token(data_source_id: &str) -> Result<(), AppError> {
    let account = onedrive_refresh_token_account(data_source_id);
    store().delete(Service::Onedrive, &account)
}

#[cfg(test)]
pub mod test_support {
    use std::collections::HashMap;
    use std::sync::{Arc, Mutex, MutexGuard};

    use super::CredentialBackend;
    use crate::error::AppError;

    /// Global test backend. Non-test builds always see `None`; unit tests can install
    /// a memory backend via `use_test_backend`.
    static TEST_BACKEND: Mutex<Option<Arc<dyn CredentialBackend>>> = Mutex::new(None);

    /// Serializes tests that mutate the global credential backend.
    static TEST_BACKEND_LOCK: Mutex<()> = Mutex::new(());

    /// Forces the specified backend while held and restores the system keyring when dropped.
    pub struct TestBackendGuard {
        _lock: MutexGuard<'static, ()>,
    }

    impl Drop for TestBackendGuard {
        fn drop(&mut self) {
            *TEST_BACKEND.lock().unwrap() = None;
        }
    }

    /// Sets the global credential backend in tests so cross-module tests do not pollute
    /// the system keyring. The returned guard must live until the end of the test.
    pub fn use_test_backend(backend: impl CredentialBackend + 'static) -> TestBackendGuard {
        let lock = TEST_BACKEND_LOCK.lock().unwrap();
        *TEST_BACKEND.lock().unwrap() = Some(Arc::new(backend));
        TestBackendGuard { _lock: lock }
    }

    /// Returns the currently installed test backend, if any.
    pub(crate) fn get_backend() -> Option<Arc<dyn CredentialBackend>> {
        TEST_BACKEND.lock().unwrap().clone()
    }

    /// In-memory credential backend for tests only.
    #[derive(Debug, Default, Clone)]
    pub struct MemoryBackend {
        store: Arc<Mutex<HashMap<(String, String), String>>>,
    }

    impl CredentialBackend for MemoryBackend {
        fn set_password(&self, service: &str, account: &str, secret: &str) -> Result<(), AppError> {
            self.store
                .lock()
                .map_err(|e| AppError::Credential(format!("内存存储锁定失败: {e}")))?
                .insert(
                    (service.to_string(), account.to_string()),
                    secret.to_string(),
                );
            Ok(())
        }

        fn get_password(&self, service: &str, account: &str) -> Result<Option<String>, AppError> {
            Ok(self
                .store
                .lock()
                .map_err(|e| AppError::Credential(format!("内存存储锁定失败: {e}")))?
                .get(&(service.to_string(), account.to_string()))
                .cloned())
        }

        fn delete_credential(&self, service: &str, account: &str) -> Result<(), AppError> {
            self.store
                .lock()
                .map_err(|e| AppError::Credential(format!("内存存储锁定失败: {e}")))?
                .remove(&(service.to_string(), account.to_string()));
            Ok(())
        }
    }

    /// A credential backend that always fails, used to verify `CredentialStore` error wrapping.
    pub struct FailingBackend;

    impl CredentialBackend for FailingBackend {
        fn set_password(
            &self,
            _service: &str,
            _account: &str,
            _secret: &str,
        ) -> Result<(), AppError> {
            Err(AppError::Credential("save exploded".to_string()))
        }

        fn get_password(&self, _service: &str, _account: &str) -> Result<Option<String>, AppError> {
            Err(AppError::Credential("read exploded".to_string()))
        }

        fn delete_credential(&self, _service: &str, _account: &str) -> Result<(), AppError> {
            Err(AppError::Credential("delete exploded".to_string()))
        }
    }
}

#[cfg(test)]
pub use test_support::{use_test_backend, MemoryBackend};

#[cfg(test)]
mod tests {
    use super::test_support::FailingBackend;
    use super::*;

    #[test]
    fn webdav_password_account_should_include_data_source_id_when_data_source_id_is_given() {
        assert_eq!(
            webdav_password_account("abc-123"),
            "webdav-password-abc-123"
        );
    }

    #[test]
    fn onedrive_refresh_token_account_should_include_data_source_id_when_data_source_id_is_given() {
        assert_eq!(
            onedrive_refresh_token_account("eb859db9"),
            "onedriveres-eb859db9"
        );
    }

    #[test]
    fn credential_store_memory_should_return_saved_secret_when_secret_is_saved() {
        let store = CredentialStore::memory();
        let account = "test-account";
        let secret = "test-secret";

        assert_eq!(store.read(Service::Webdav, account).unwrap(), None);

        store.save(Service::Webdav, account, secret).unwrap();
        assert_eq!(
            store.read(Service::Webdav, account).unwrap(),
            Some(secret.to_string())
        );
    }

    #[test]
    fn credential_store_memory_should_keep_secrets_separate_when_services_are_isolated() {
        let store = CredentialStore::memory();
        let account = "shared-account";

        store
            .save(Service::Webdav, account, "webdav-secret")
            .unwrap();
        store
            .save(Service::Onedrive, account, "onedrive-secret")
            .unwrap();

        assert_eq!(
            store.read(Service::Webdav, account).unwrap(),
            Some("webdav-secret".to_string())
        );
        assert_eq!(
            store.read(Service::Onedrive, account).unwrap(),
            Some("onedrive-secret".to_string())
        );
    }

    #[test]
    fn credential_store_memory_should_return_none_when_entry_is_deleted() {
        let store = CredentialStore::memory();
        let account = "delete-me";

        store.save(Service::Onedrive, account, "token").unwrap();
        assert!(store.read(Service::Onedrive, account).unwrap().is_some());

        store.delete(Service::Onedrive, account).unwrap();
        assert_eq!(store.read(Service::Onedrive, account).unwrap(), None);

        store.delete(Service::Onedrive, account).unwrap();
    }

    #[test]
    fn service_label_should_return_descriptive_name_when_service_is_queried() {
        assert_eq!(Service::Webdav.label(), "WebDAV 密码");
        assert_eq!(Service::Onedrive.label(), "OneDrive refresh token");
    }

    #[test]
    fn webdav_password_wrapper_should_round_trip_with_test_backend_when_password_is_saved() {
        let _guard = use_test_backend(MemoryBackend::default());
        let account = webdav_password_account("ds-webdav");

        assert_eq!(read_webdav_password(&account).unwrap(), None);

        save_webdav_password(&account, "secret").unwrap();
        assert_eq!(
            read_webdav_password(&account).unwrap(),
            Some("secret".to_string())
        );

        delete_webdav_password(&account).unwrap();
        assert_eq!(read_webdav_password(&account).unwrap(), None);
    }

    #[test]
    fn onedrive_refresh_token_wrapper_should_round_trip_with_test_backend_when_token_is_saved() {
        let _guard = use_test_backend(MemoryBackend::default());
        let data_source_id = "ds-onedrive";

        assert_eq!(read_onedrive_refresh_token(data_source_id).unwrap(), None);

        let account = onedrive_refresh_token_account(data_source_id);
        save_onedrive_refresh_token(&account, "refresh").unwrap();
        assert_eq!(
            read_onedrive_refresh_token(data_source_id).unwrap(),
            Some("refresh".to_string())
        );

        delete_onedrive_refresh_token(data_source_id).unwrap();
        assert_eq!(read_onedrive_refresh_token(data_source_id).unwrap(), None);
    }

    #[test]
    fn credential_store_should_wrap_save_error_with_service_label_when_save_fails() {
        let store = CredentialStore {
            backend: Arc::new(FailingBackend),
        };
        let err = store.save(Service::Webdav, "a", "b").unwrap_err();
        let msg = format!("{err}");
        assert!(msg.contains("保存WebDAV 密码失败"), "{msg}");
    }

    #[test]
    fn credential_store_should_wrap_read_error_with_service_label_when_read_fails() {
        let store = CredentialStore {
            backend: Arc::new(FailingBackend),
        };
        let err = store.read(Service::Onedrive, "a").unwrap_err();
        let msg = format!("{err}");
        assert!(msg.contains("读取OneDrive refresh token失败"), "{msg}");
    }

    #[test]
    fn credential_store_should_wrap_delete_error_with_service_label_when_delete_fails() {
        let store = CredentialStore {
            backend: Arc::new(FailingBackend),
        };
        let err = store.delete(Service::Webdav, "a").unwrap_err();
        let msg = format!("{err}");
        assert!(msg.contains("删除WebDAV 密码失败"), "{msg}");
    }
}
