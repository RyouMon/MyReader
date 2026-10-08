use std::sync::Arc;

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
