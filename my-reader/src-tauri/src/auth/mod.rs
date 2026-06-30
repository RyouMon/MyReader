//! Authentication and credential infrastructure.
//!
//! This module handles authentication protocols with external services and credential storage; it is not part of the sync engine:
//! - [`credentials`]: secure credential storage based on `keyring`.
//! - [`onedrive`]: OneDrive OAuth2 flow and token management.

pub(crate) mod credentials;
pub mod onedrive;

#[cfg(debug_assertions)]
#[doc(hidden)]
pub mod test_support {
    pub use super::credentials::{
        read_onedrive_refresh_token, read_webdav_password, use_test_backend,
        webdav_password_account, MemoryBackend,
    };
}
