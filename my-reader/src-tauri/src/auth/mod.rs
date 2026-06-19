//! Authentication and credential infrastructure.
//!
//! This module handles authentication protocols with external services and credential storage; it is not part of the sync engine:
//! - [`credentials`]: secure credential storage based on `keyring`.
//! - [`onedrive`]: OneDrive OAuth2 flow and token management.

pub mod onedrive;
pub(crate) mod credentials;
