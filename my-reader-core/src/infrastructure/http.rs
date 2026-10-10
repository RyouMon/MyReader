use std::sync::Arc;

use opendal::{Buffer, Error, ErrorKind, HttpBody, HttpTransport, HttpTransporter};

pub(crate) fn storage_transport(client: reqwest::Client) -> HttpTransporter {
    HttpTransporter::new(StorageHttpTransport(
        opendal_http_transport_reqwest::ReqwestTransport::new(client),
    ))
}

#[derive(Debug)]
struct StorageHttpTransport(opendal_http_transport_reqwest::ReqwestTransport);

impl HttpTransport for StorageHttpTransport {
    async fn fetch(
        &self,
        request: http::Request<Buffer>,
    ) -> opendal::Result<http::Response<HttpBody>> {
        let response = self.0.fetch(request).await?;
        let status = response.status();
        // OpenDAL's WebDAV backend does not classify 401 or 429. Normalize
        // them before the service parser loses the structured HTTP status.
        let kind = match status {
            http::StatusCode::UNAUTHORIZED | http::StatusCode::FORBIDDEN => {
                ErrorKind::PermissionDenied
            }
            http::StatusCode::TOO_MANY_REQUESTS => ErrorKind::RateLimited,
            _ => return Ok(response),
        };
        Err(Error::new(kind, "Storage request failed")
            .with_context("status", status)
            .with_temporary(kind == ErrorKind::RateLimited))
    }
}

/// Keep the Mozilla roots used by reqwest 0.12's `rustls-tls` feature.
/// Reqwest 0.13's platform verifier needs JVM initialization on Android, while
/// Core is a UniFFI library with no Android context.
pub(crate) fn client_builder() -> reqwest::ClientBuilder {
    let roots = rustls::RootCertStore {
        roots: webpki_roots::TLS_SERVER_ROOTS.to_vec(),
    };
    let tls = rustls::ClientConfig::builder_with_provider(Arc::new(
        rustls::crypto::ring::default_provider(),
    ))
    .with_safe_default_protocol_versions()
    .expect("ring supports the default TLS protocol versions")
    .with_root_certificates(roots)
    .with_no_client_auth();
    reqwest::Client::builder().tls_backend_preconfigured(tls)
}
