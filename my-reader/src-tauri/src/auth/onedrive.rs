use std::collections::HashMap;
use std::io::{BufRead, BufReader, Write};
use std::net::TcpListener;
use std::sync::Arc;

use oauth2::basic::{
    BasicErrorResponse, BasicRevocationErrorResponse, BasicTokenIntrospectionResponse,
    BasicTokenType,
};
use oauth2::reqwest::async_http_client;
use oauth2::revocation::StandardRevocableToken;
use oauth2::{
    AuthUrl, AuthorizationCode, Client, ClientId, CsrfToken, ExtraTokenFields, PkceCodeChallenge,
    PkceCodeVerifier, RedirectUrl, RefreshToken, Scope, StandardTokenResponse, TokenResponse, TokenUrl,
};
use serde::{Deserialize, Serialize};
use tokio::sync::RwLock;

use tracing::{info, warn};

use crate::error::AppError;
use crate::clients::graph::{GraphClient, ReqwestGraphClient};

const DEFAULT_CLIENT_ID: &str = "9750fea8-e428-4d4d-8956-7738561e14ac";
const DEFAULT_TENANT_ID: &str = "consumers";

/// Extra token fields returned by Microsoft's OIDC token endpoint.
#[derive(Debug, Clone, Deserialize, Serialize)]
struct OnedriveExtraTokenFields {
    id_token: Option<String>,
}

impl ExtraTokenFields for OnedriveExtraTokenFields {}

type OnedriveTokenResponse = StandardTokenResponse<OnedriveExtraTokenFields, BasicTokenType>;
type OnedriveClient = Client<
    BasicErrorResponse,
    OnedriveTokenResponse,
    BasicTokenType,
    BasicTokenIntrospectionResponse,
    StandardRevocableToken,
    BasicRevocationErrorResponse,
>;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OnedriveUserInfo {
    pub display_name: String,
    pub email: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OnedriveAuthResult {
    pub access_token: String,
    pub refresh_token: String,
    pub user_info: OnedriveUserInfo,
}

struct CachedToken {
    access_token: String,
    expires_at: std::time::Instant,
}

pub struct OnedriveTokenManager {
    cache: Arc<RwLock<HashMap<String, CachedToken>>>,
}

impl OnedriveTokenManager {
    pub fn new() -> Self {
        Self {
            cache: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    /// Start an interactive OAuth2 authorization code flow with loopback redirect.
    pub async fn start_auth_flow(
        &self,
        client_id: Option<&str>,
        tenant_id: Option<&str>,
    ) -> Result<OnedriveAuthResult, AppError> {
        let tid = tenant_id.filter(|s| !s.trim().is_empty()).unwrap_or(DEFAULT_TENANT_ID);
        let auth_url = format!("https://login.microsoftonline.com/{tid}/oauth2/v2.0/authorize");
        let token_url = format!("https://login.microsoftonline.com/{tid}/oauth2/v2.0/token");

        let graph = ReqwestGraphClient::new()?;
        self.start_auth_flow_internal(
            client_id,
            tenant_id,
            &auth_url,
            &token_url,
            &graph,
            |authorize_url, _redirect_uri| {
                open::that(authorize_url)
                    .map_err(|e| AppError::Auth(format!("Failed to open browser: {e}")))
            },
        )
        .await
    }

    /// Testable core of `start_auth_flow`: URLs, Graph client and browser opener are all injectable.
    async fn start_auth_flow_internal(
        &self,
        client_id: Option<&str>,
        tenant_id: Option<&str>,
        auth_url: &str,
        token_url: &str,
        graph: &dyn GraphClient,
        open_browser: impl FnOnce(&str, &str) -> Result<(), AppError>,
    ) -> Result<OnedriveAuthResult, AppError> {
        let cid = client_id.filter(|s| !s.trim().is_empty()).unwrap_or(DEFAULT_CLIENT_ID);
        let _tid = tenant_id.filter(|s| !s.trim().is_empty()).unwrap_or(DEFAULT_TENANT_ID);

        let listener = TcpListener::bind("127.0.0.1:0")
            .map_err(|e| AppError::Auth(format!("Failed to bind loopback listener: {e}")))?;
        let local_port = listener
            .local_addr()
            .map_err(|e| AppError::Auth(format!("Failed to get local port: {e}")))?
            .port();

        let redirect_uri = format!("http://localhost:{local_port}");

        let client = OnedriveClient::new(
            ClientId::new(cid.to_string()),
            None,
            AuthUrl::new(auth_url.to_string())
                .map_err(|e| AppError::Auth(format!("Invalid auth URL: {e}")))?,
            Some(
                TokenUrl::new(token_url.to_string())
                    .map_err(|e| AppError::Auth(format!("Invalid token URL: {e}")))?,
            ),
        )
        .set_redirect_uri(
            RedirectUrl::new(redirect_uri.clone())
                .map_err(|e| AppError::Auth(format!("Invalid redirect URI: {e}")))?,
        );

        let (pkce_challenge, pkce_verifier) = PkceCodeChallenge::new_random_sha256();

        let (authorize_url, _csrf_token) = client
            .authorize_url(CsrfToken::new_random)
            .add_scope(Scope::new("openid".to_string()))
            .add_scope(Scope::new("profile".to_string()))
            .add_scope(Scope::new("email".to_string()))
            .add_scope(Scope::new("Files.ReadWrite.All".to_string()))
            .add_scope(Scope::new("User.Read".to_string()))
            .add_scope(Scope::new("offline_access".to_string()))
            .add_extra_param("prompt", "consent")
            .set_pkce_challenge(pkce_challenge)
            .url();

        open_browser(authorize_url.as_str(), &redirect_uri)?;

        let (code, _state) = wait_for_callback(listener)?;

        let token_response = exchange_code_for_tokens(
            auth_url,
            token_url,
            &cid,
            &redirect_uri,
            &code,
            pkce_verifier,
        )
        .await?;

        let access_token = token_response.access_token().secret().to_string();
        let refresh_token = token_response
            .refresh_token()
            .map(|t| t.secret().to_string())
            .unwrap_or_default();
        let id_token = token_response.extra_fields().id_token.clone();

        info!(
            "OneDrive token response: access_token_len={} refresh_token_len={} id_token_present={}",
            access_token.len(),
            refresh_token.len(),
            id_token.is_some()
        );

        if refresh_token.is_empty() {
            return Err(AppError::Auth(
                "Microsoft did not return a refresh token. Please sign in again and ensure you consent to offline access.".to_string(),
            ));
        }

        let user_info = fetch_user_info(graph, &access_token, id_token.as_deref()).await?;

        Ok(OnedriveAuthResult {
            access_token,
            refresh_token,
            user_info,
        })
    }

    /// Get a valid access token for the given data source, refreshing if needed.
    pub async fn get_access_token(
        &self,
        data_source_id: &str,
        client_id: Option<&str>,
        tenant_id: Option<&str>,
    ) -> Result<String, AppError> {
        // Check cache first
        {
            let cache = self.cache.read().await;
            if let Some(cached) = cache.get(data_source_id) {
                if cached.expires_at > std::time::Instant::now() {
                    return Ok(cached.access_token.clone());
                }
            }
        }

        // Need to refresh
        self.refresh_access_token(data_source_id, client_id, tenant_id).await
    }

    /// Refresh the access token using the stored refresh token.
    pub async fn refresh_access_token(
        &self,
        data_source_id: &str,
        client_id: Option<&str>,
        tenant_id: Option<&str>,
    ) -> Result<String, AppError> {
        let tid = tenant_id.filter(|s| !s.trim().is_empty()).unwrap_or(DEFAULT_TENANT_ID);
        let auth_url = format!("https://login.microsoftonline.com/{tid}/oauth2/v2.0/authorize");
        let token_url = format!("https://login.microsoftonline.com/{tid}/oauth2/v2.0/token");

        self.refresh_access_token_internal(
            data_source_id,
            client_id,
            tenant_id,
            &auth_url,
            &token_url,
        )
        .await
    }

    async fn refresh_access_token_internal(
        &self,
        data_source_id: &str,
        client_id: Option<&str>,
        tenant_id: Option<&str>,
        auth_url: &str,
        token_url: &str,
    ) -> Result<String, AppError> {
        let cid = client_id.filter(|s| !s.trim().is_empty()).unwrap_or(DEFAULT_CLIENT_ID);
        let _tenant_id = tenant_id.filter(|s| !s.trim().is_empty()).unwrap_or(DEFAULT_TENANT_ID);

        let stored = crate::auth::credentials::read_onedrive_refresh_token(data_source_id)?;
        let refresh_token = stored.ok_or_else(|| AppError::Auth("No refresh token found".to_string()))?;

        let token_response = request_token_refresh(
            auth_url,
            token_url,
            &cid,
            &refresh_token,
        )
        .await?;

        let access_token = token_response.access_token().secret().to_string();

        // Update refresh token if a new one was returned
        if let Some(new_rt) = token_response.refresh_token() {
            crate::auth::credentials::save_onedrive_refresh_token(data_source_id, new_rt.secret())?;
        }

        // Cache the access token (assume 1 hour TTL if not parseable)
        let expires_in = token_response.expires_in()
            .map(|d| d.as_secs() as usize)
            .unwrap_or(3600);
        let expires_at = std::time::Instant::now() + std::time::Duration::from_secs(expires_in as u64);

        {
            let mut cache = self.cache.write().await;
            cache.insert(data_source_id.to_string(), CachedToken {
                access_token: access_token.clone(),
                expires_at,
            });
        }

        Ok(access_token)
    }
}

async fn exchange_code_for_tokens(
    auth_url: &str,
    token_url: &str,
    client_id: &str,
    redirect_uri: &str,
    code: &str,
    verifier: PkceCodeVerifier,
) -> Result<OnedriveTokenResponse, AppError> {
    let client = OnedriveClient::new(
        ClientId::new(client_id.to_string()),
        None,
        AuthUrl::new(auth_url.to_string())
            .map_err(|e| AppError::Auth(format!("Invalid auth URL: {e}")))?,
        Some(
            TokenUrl::new(token_url.to_string())
                .map_err(|e| AppError::Auth(format!("Invalid token URL: {e}")))?,
        ),
    )
    .set_redirect_uri(
        RedirectUrl::new(redirect_uri.to_string())
            .map_err(|e| AppError::Auth(format!("Invalid redirect URI: {e}")))?,
    );

    client
        .exchange_code(AuthorizationCode::new(code.to_string()))
        .set_pkce_verifier(verifier)
        .request_async(async_http_client)
        .await
        .map_err(|e| AppError::Auth(format!("Token exchange failed: {e}")))
}

async fn request_token_refresh(
    auth_url: &str,
    token_url: &str,
    client_id: &str,
    refresh_token: &str,
) -> Result<OnedriveTokenResponse, AppError> {
    let client = OnedriveClient::new(
        ClientId::new(client_id.to_string()),
        None,
        AuthUrl::new(auth_url.to_string())
            .map_err(|e| AppError::Auth(format!("Invalid auth URL: {e}")))?,
        Some(
            TokenUrl::new(token_url.to_string())
                .map_err(|e| AppError::Auth(format!("Invalid token URL: {e}")))?,
        ),
    );

    client
        .exchange_refresh_token(&RefreshToken::new(refresh_token.to_string()))
        .request_async(async_http_client)
        .await
        .map_err(|e| {
            let detail = match &e {
                oauth2::RequestTokenError::ServerResponse(resp) => {
                    let desc = resp.error_description().map(|s| s.as_str()).unwrap_or("");
                    format!("{}: {}", resp.error(), desc)
                }
                oauth2::RequestTokenError::Request(req_err) => {
                    format!("HTTP request failed: {req_err}")
                }
                oauth2::RequestTokenError::Parse(parse_err, body) => {
                    format!("Parse error: {parse_err}, body: {body:?}")
                }
                oauth2::RequestTokenError::Other(msg) => msg.clone(),
            };
            AppError::Auth(format!("Token refresh failed: {detail}"))
        })
}

async fn fetch_user_info(
    graph: &dyn GraphClient,
    access_token: &str,
    id_token: Option<&str>,
) -> Result<OnedriveUserInfo, AppError> {
    let mut display_name = String::new();
    let mut email = String::new();

    // Try Microsoft Graph first.
    match graph.get_me(access_token).await {
        Ok(body) => {
            info!(
                "OneDrive /me body fields: displayName={:?} mail={:?} userPrincipalName={:?}",
                body.get("displayName"),
                body.get("mail"),
                body.get("userPrincipalName")
            );
            display_name = body["displayName"].as_str().unwrap_or("").to_string();
            email = body["mail"]
                .as_str()
                .or_else(|| body["userPrincipalName"].as_str())
                .unwrap_or("")
                .to_string();
        }
        Err(e) => {
            warn!("OneDrive /me request failed: {e}");
        }
    }

    // Fallback to id_token claims if Graph did not provide usable values.
    if display_name.is_empty() || email.is_empty() {
        if let Some(id_token) = id_token {
            match parse_id_token_claims(id_token) {
                Ok(claims) => {
                    info!(
                        "OneDrive id_token claims: name={:?} email={:?} preferred_username={:?}",
                        claims.name, claims.email, claims.preferred_username
                    );
                    if display_name.is_empty() {
                        display_name = claims.name.unwrap_or_default();
                    }
                    if email.is_empty() {
                        email = claims.email.or(claims.preferred_username).unwrap_or_default();
                    }
                }
                Err(e) => warn!("OneDrive id_token parse failed: {e}"),
            }
        } else {
            warn!("OneDrive id_token not available for fallback");
        }
    }

    if display_name.is_empty() {
        display_name = "Unknown".to_string();
    }

    info!(
        "OneDrive resolved user_info: display_name={} email={:?}",
        display_name, email
    );

    Ok(OnedriveUserInfo {
        display_name,
        email: if email.is_empty() { None } else { Some(email) },
    })
}

#[derive(Debug, Clone, Deserialize)]
struct IdTokenClaims {
    #[serde(default)]
    name: Option<String>,
    #[serde(default)]
    email: Option<String>,
    #[serde(default, rename = "preferred_username")]
    preferred_username: Option<String>,
}

fn parse_id_token_claims(id_token: &str) -> Result<IdTokenClaims, AppError> {
    use base64::engine::general_purpose::URL_SAFE_NO_PAD;
    use base64::Engine;

    let payload = id_token
        .split('.')
        .nth(1)
        .ok_or_else(|| AppError::Auth("Invalid id_token format".to_string()))?;
    let decoded = URL_SAFE_NO_PAD
        .decode(payload)
        .map_err(|e| AppError::Auth(format!("Failed to decode id_token: {e}")))?;
    serde_json::from_slice(&decoded)
        .map_err(|e| AppError::Auth(format!("Failed to parse id_token claims: {e}")))
}

/// Listen on the loopback for the OAuth2 redirect callback, extract the authorization code.
fn wait_for_callback(listener: TcpListener) -> Result<(String, String), AppError> {
    let (mut stream, _) = listener.accept()
        .map_err(|e| AppError::Auth(format!("Failed to accept callback connection: {e}")))?;

    let mut reader = BufReader::new(&mut stream);
    let mut request_line = String::new();
    reader.read_line(&mut request_line)
        .map_err(|e| AppError::Auth(format!("Failed to read callback: {e}")))?;

    let url = request_line.split_whitespace().nth(1)
        .ok_or_else(|| AppError::Auth("Invalid callback request".to_string()))?;

    let parsed = url::Url::parse(&format!("http://localhost{url}"))
        .map_err(|e| AppError::Auth(format!("Failed to parse callback URL: {e}")))?;

    let params: HashMap<_, _> = parsed.query_pairs().collect();

    let code = params.get("code")
        .ok_or_else(|| {
            let err = params.get("error").map(|s| s.to_string())
                .unwrap_or_else(|| "missing code".to_string());
            AppError::Auth(format!("OAuth callback error: {err}"))
        })?
        .to_string();

    let state = params.get("state")
        .map(|s| s.to_string())
        .unwrap_or_default();

    // Send a success response to the browser
    let response = "HTTP/1.1 200 OK\r\nContent-Type: text/html\r\n\r\n\
        <html><body><h2>Authorization successful!</h2>\
        <p>You can close this tab and return to MyReader.</p></body></html>";
    stream.write_all(response.as_bytes())
        .map_err(|e| AppError::Auth(format!("Failed to send callback response: {e}")))?;
    stream.flush().ok();

    Ok((code, state))
}

// ── Inline tests ──────────────────────────────────────────────────────

#[cfg(test)]
impl OnedriveTokenManager {
    /// Test-only: insert a token directly into the cache.
    pub async fn insert_test_token(
        &self,
        data_source_id: &str,
        access_token: &str,
        expires_at: std::time::Instant,
    ) {
        let mut cache = self.cache.write().await;
        cache.insert(
            data_source_id.to_string(),
            CachedToken {
                access_token: access_token.to_string(),
                expires_at,
            },
        );
    }
}

#[cfg(test)]
mod tests {
    use async_trait::async_trait;
    use super::*;
    use base64::engine::general_purpose::URL_SAFE_NO_PAD;
    use base64::Engine;
    use std::io::Read;
    use std::thread;

    use warp::Filter;

    use crate::auth::credentials::{
        onedrive_refresh_token_account, save_onedrive_refresh_token, use_test_backend, MemoryBackend,
    };

    fn encode_id_token_payload(claims: serde_json::Value) -> String {
        let payload = URL_SAFE_NO_PAD.encode(claims.to_string().as_bytes());
        format!("header.{payload}.signature")
    }

    #[test]
    fn parse_id_token_claims_should_extract_all_fields_when_token_contains_all_claims() {
        let token = encode_id_token_payload(serde_json::json!({
            "name": "Wen Liang",
            "email": "wenslife@outlook.com",
            "preferred_username": "wenslife@outlook.com",
        }));

        let claims = parse_id_token_claims(&token).unwrap();
        assert_eq!(claims.name, Some("Wen Liang".to_string()));
        assert_eq!(claims.email, Some("wenslife@outlook.com".to_string()));
        assert_eq!(claims.preferred_username, Some("wenslife@outlook.com".to_string()));
    }

    #[test]
    fn parse_id_token_claims_should_leave_optional_fields_none_when_claims_are_missing() {
        let token = encode_id_token_payload(serde_json::json!({
            "preferred_username": "wenslife@outlook.com",
        }));

        let claims = parse_id_token_claims(&token).unwrap();
        assert_eq!(claims.name, None);
        assert_eq!(claims.email, None);
        assert_eq!(claims.preferred_username, Some("wenslife@outlook.com".to_string()));
    }

    #[test]
    fn parse_id_token_claims_should_reject_malformed_token_when_token_is_malformed() {
        assert!(parse_id_token_claims("not-a-jwt").is_err());
        assert!(parse_id_token_claims("only-one-part").is_err());
    }

    #[test]
    fn wait_for_callback_should_extract_code_and_state_when_callback_contains_them() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();

        let request = format!(
            "GET /?code=abc123&state=xyz HTTP/1.1\r\nHost: localhost:{port}\r\n\r\n"
        );

        thread::spawn(move || {
            let mut stream = std::net::TcpStream::connect(("127.0.0.1", port)).unwrap();
            stream.write_all(request.as_bytes()).unwrap();
            stream.flush().unwrap();

            let mut buf = [0u8; 1024];
            let n = stream.read(&mut buf).unwrap();
            let response = String::from_utf8_lossy(&buf[..n]);
            assert!(response.contains("Authorization successful"));
        });

        let (code, state) = wait_for_callback(listener).unwrap();
        assert_eq!(code, "abc123");
        assert_eq!(state, "xyz");
    }

    #[test]
    fn wait_for_callback_should_report_error_when_callback_contains_error() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();

        let request = format!(
            "GET /?error=access_denied&error_description=user+denied HTTP/1.1\r\nHost: localhost:{port}\r\n\r\n"
        );

        thread::spawn(move || {
            let mut stream = std::net::TcpStream::connect(("127.0.0.1", port)).unwrap();
            stream.write_all(request.as_bytes()).unwrap();
            stream.flush().unwrap();

            let mut buf = [0u8; 1024];
            let _ = stream.read(&mut buf);
        });

        let err = wait_for_callback(listener).unwrap_err();
        assert!(format!("{err}").contains("access_denied"));
    }

    struct MockGraphClient {
        result: Result<serde_json::Value, String>,
    }

    #[async_trait]
    impl GraphClient for MockGraphClient {
        async fn get_me(&self, _access_token: &str) -> Result<serde_json::Value, AppError> {
            match &self.result {
                Ok(v) => Ok(v.clone()),
                Err(msg) => Err(AppError::Auth(msg.clone())),
            }
        }

        async fn list_onedrive_folders(
            &self,
            _access_token: &str,
            _path: &str,
        ) -> Result<Vec<crate::models::OnedriveFolderEntry>, AppError> {
            Ok(vec![])
        }
    }

    #[tokio::test]
    async fn fetch_user_info_should_prefer_graph_when_graph_returns_name_and_email() {
        let graph = MockGraphClient {
            result: Ok(serde_json::json!({
                "displayName": "Graph Name",
                "mail": "graph@example.com",
            })),
        };
        let id_token = encode_id_token_payload(serde_json::json!({
            "name": "IdToken Name",
            "email": "idtoken@example.com",
        }));

        let info = fetch_user_info(&graph, "token", Some(&id_token)).await.unwrap();
        assert_eq!(info.display_name, "Graph Name");
        assert_eq!(info.email, Some("graph@example.com".to_string()));
    }

    #[tokio::test]
    async fn fetch_user_info_should_fall_back_to_id_token_email_when_graph_lacks_email() {
        let graph = MockGraphClient {
            result: Ok(serde_json::json!({
                "displayName": "Graph Name",
            })),
        };
        let id_token = encode_id_token_payload(serde_json::json!({
            "email": "fallback@example.com",
        }));

        let info = fetch_user_info(&graph, "token", Some(&id_token)).await.unwrap();
        assert_eq!(info.display_name, "Graph Name");
        assert_eq!(info.email, Some("fallback@example.com".to_string()));
    }

    #[tokio::test]
    async fn fetch_user_info_should_fall_back_to_id_token_when_graph_fails() {
        let graph = MockGraphClient {
            result: Err("network down".to_string()),
        };
        let id_token = encode_id_token_payload(serde_json::json!({
            "name": "Fallback Name",
            "email": "fallback@example.com",
        }));

        let info = fetch_user_info(&graph, "token", Some(&id_token)).await.unwrap();
        assert_eq!(info.display_name, "Fallback Name");
        assert_eq!(info.email, Some("fallback@example.com".to_string()));
    }

    #[tokio::test]
    async fn fetch_user_info_should_return_unknown_user_when_no_source_is_available() {
        let graph = MockGraphClient {
            result: Err("network down".to_string()),
        };

        let info = fetch_user_info(&graph, "token", None).await.unwrap();
        assert_eq!(info.display_name, "Unknown");
        assert_eq!(info.email, None);
    }

    #[tokio::test]
    async fn fetch_user_info_should_use_preferred_username_as_email_when_id_token_has_only_preferred_username() {
        let graph = MockGraphClient {
            result: Ok(serde_json::json!({})),
        };
        let id_token = encode_id_token_payload(serde_json::json!({
            "preferred_username": "preferred@example.com",
        }));

        let info = fetch_user_info(&graph, "token", Some(&id_token)).await.unwrap();
        assert_eq!(info.display_name, "Unknown");
        assert_eq!(info.email, Some("preferred@example.com".to_string()));
    }

    #[tokio::test]
    async fn get_access_token_should_return_cached_token_when_not_expired() {
        let manager = OnedriveTokenManager::new();
        manager
            .insert_test_token("ds-1", "cached-token", std::time::Instant::now() + std::time::Duration::from_secs(3600))
            .await;

        let token = manager
            .get_access_token("ds-1", None, None)
            .await
            .unwrap();
        assert_eq!(token, "cached-token");
    }

    #[tokio::test]
    async fn get_access_token_should_refresh_when_cached_token_is_expired() {
        let manager = OnedriveTokenManager::new();
        manager
            .insert_test_token("ds-1", "expired-token", std::time::Instant::now() - std::time::Duration::from_secs(1))
            .await;

        let err = manager
            .get_access_token("ds-1", None, None)
            .await
            .unwrap_err();
        assert!(format!("{err}").contains("No refresh token found"));
    }

    #[tokio::test]
    async fn refresh_access_token_should_use_default_client_id_and_fail_without_token_when_client_id_is_empty() {
        let manager = OnedriveTokenManager::new();
        let err = manager
            .refresh_access_token("ds-no-token", Some(""), None)
            .await
            .unwrap_err();
        // Empty client_id falls back to DEFAULT_CLIENT_ID, then fails because no refresh token.
        assert!(format!("{err}").contains("No refresh token found"));
    }

    #[tokio::test]
    async fn refresh_access_token_should_fail_when_no_refresh_token_is_stored() {
        let manager = OnedriveTokenManager::new();
        let err = manager
            .refresh_access_token("ds-no-token", None, None)
            .await
            .unwrap_err();
        assert!(format!("{err}").contains("No refresh token found"));
    }

    #[test]
    fn wait_for_callback_should_report_invalid_request_when_callback_request_is_invalid() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();

        thread::spawn(move || {
            let mut stream = std::net::TcpStream::connect(("127.0.0.1", port)).unwrap();
            stream.write_all(b"\r\n").unwrap();
            stream.flush().unwrap();
        });

        let err = wait_for_callback(listener).unwrap_err();
        assert!(format!("{err}").contains("Invalid callback request"));
    }

    #[test]
    fn wait_for_callback_should_report_missing_code_when_callback_has_no_code_or_error() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();

        thread::spawn(move || {
            let mut stream = std::net::TcpStream::connect(("127.0.0.1", port)).unwrap();
            stream
                .write_all(format!("GET /?state=xyz HTTP/1.1\r\nHost: localhost:{port}\r\n\r\n").as_bytes())
                .unwrap();
            stream.flush().unwrap();
        });

        let err = wait_for_callback(listener).unwrap_err();
        assert!(format!("{err}").contains("missing code"));
    }

    #[test]
    fn parse_id_token_claims_should_reject_invalid_base64_payload_when_payload_is_invalid_base64() {
        let err = parse_id_token_claims("header.not-base64!.signature").unwrap_err();
        assert!(format!("{err}").contains("Failed to decode id_token"));
    }

    #[test]
    fn parse_id_token_claims_should_reject_invalid_json_payload_when_payload_is_invalid_json() {
        use base64::engine::general_purpose::URL_SAFE_NO_PAD;
        use base64::Engine;

        let payload = URL_SAFE_NO_PAD.encode(b"not-json");
        let token = format!("header.{payload}.signature");

        let err = parse_id_token_claims(&token).unwrap_err();
        assert!(format!("{err}").contains("Failed to parse id_token claims"));
    }

    /// Start a local OAuth2 token endpoint for testing code/refresh exchange.
    fn start_token_server(success: bool) -> std::net::SocketAddr {
        let success_body = serde_json::json!({
            "access_token": "access",
            "token_type": "Bearer",
            "expires_in": 3600,
            "refresh_token": "refresh",
        })
        .to_string();
        let error_body = serde_json::json!({
            "error": "invalid_grant",
            "error_description": "bad refresh token",
        })
        .to_string();

        let route = warp::path("token")
            .and(warp::method())
            .map(move |_method: warp::http::Method| {
                if success {
                    warp::http::Response::builder()
                        .status(200)
                        .header("content-type", "application/json")
                        .body(success_body.clone())
                        .unwrap()
                } else {
                    warp::http::Response::builder()
                        .status(400)
                        .header("content-type", "application/json")
                        .body(error_body.clone())
                        .unwrap()
                }
            });

        let (addr, server) = warp::serve(route).bind_ephemeral(([127, 0, 0, 1], 0));
        tokio::spawn(server);
        addr
    }

    #[tokio::test]
    async fn request_token_refresh_should_return_access_token_when_server_returns_valid_token() {
        let addr = start_token_server(true);
        let token_url = format!("http://{addr}/token");

        let response = request_token_refresh(
            &format!("http://{addr}/auth"),
            &token_url,
            "client-id",
            "refresh",
        )
        .await
        .unwrap();

        assert_eq!(response.access_token().secret(), "access");
        assert_eq!(response.refresh_token().map(|t| t.secret().as_str()), Some("refresh"));
    }

    #[tokio::test]
    async fn request_token_refresh_should_map_server_error_when_server_returns_error() {
        let addr = start_token_server(false);
        let token_url = format!("http://{addr}/token");

        let err = request_token_refresh(
            &format!("http://{addr}/auth"),
            &token_url,
            "client-id",
            "refresh",
        )
        .await
        .unwrap_err();

        let msg = format!("{err}");
        assert!(msg.contains("Token refresh failed"));
        assert!(msg.contains("invalid_grant"));
    }

    #[tokio::test]
    async fn exchange_code_for_tokens_should_return_tokens_when_server_returns_valid_token() {
        let addr = start_token_server(true);
        let (_challenge, verifier) = PkceCodeChallenge::new_random_sha256();

        let response = exchange_code_for_tokens(
            &format!("http://{addr}/auth"),
            &format!("http://{addr}/token"),
            "client-id",
            "http://localhost",
            "code",
            verifier,
        )
        .await
        .unwrap();

        assert_eq!(response.access_token().secret(), "access");
        assert_eq!(response.refresh_token().map(|t| t.secret().as_str()), Some("refresh"));
    }

    #[tokio::test]
    async fn exchange_code_for_tokens_should_map_server_error_when_server_returns_error() {
        let addr = start_token_server(false);
        let (_challenge, verifier) = PkceCodeChallenge::new_random_sha256();

        let err = exchange_code_for_tokens(
            &format!("http://{addr}/auth"),
            &format!("http://{addr}/token"),
            "client-id",
            "http://localhost",
            "code",
            verifier,
        )
        .await
        .unwrap_err();

        assert!(format!("{err}").contains("Token exchange failed"));
    }

    /// Start a local token endpoint with a custom status code and response body.
    fn start_token_server_with_body(status: u16, body: String) -> std::net::SocketAddr {
        let route = warp::path("token")
            .and(warp::method())
            .map(move |_method: warp::http::Method| {
                warp::http::Response::builder()
                    .status(status)
                    .header("content-type", "application/json")
                    .body(body.clone())
                    .unwrap()
            });

        let (addr, server) = warp::serve(route).bind_ephemeral(([127, 0, 0, 1], 0));
        tokio::spawn(server);
        addr
    }

    #[tokio::test]
    async fn request_token_refresh_should_map_request_error_when_request_fails() {
        // Use an unsupported protocol to trigger a low-level HTTP request failure.
        let err = request_token_refresh(
            "httpx://127.0.0.1/auth",
            "httpx://127.0.0.1/token",
            "client-id",
            "refresh",
        )
        .await
        .unwrap_err();

        let msg = format!("{err}");
        assert!(msg.contains("Token refresh failed"), "{msg}");
        assert!(
            msg.contains("HTTP request failed") || msg.contains("error sending request"),
            "{msg}"
        );
    }

    #[tokio::test]
    async fn request_token_refresh_should_map_parse_error_when_response_is_not_json() {
        let addr = start_token_server_with_body(200, "not-json".to_string());

        let err = request_token_refresh(
            &format!("http://{addr}/auth"),
            &format!("http://{addr}/token"),
            "client-id",
            "refresh",
        )
        .await
        .unwrap_err();

        let msg = format!("{err}");
        assert!(msg.contains("Token refresh failed"), "{msg}");
        assert!(msg.contains("Parse error"), "{msg}");
    }

    #[tokio::test]
    async fn refresh_access_token_internal_should_exchange_and_cache_access_token_when_refresh_token_is_stored() {
        let _guard = use_test_backend(MemoryBackend::default());
        let manager = OnedriveTokenManager::new();
        let data_source_id = "ds-refresh-ok";
        let account = onedrive_refresh_token_account(data_source_id);
        save_onedrive_refresh_token(&account, "stored-refresh").unwrap();

        let addr = start_token_server(true);
        let token = manager
            .refresh_access_token_internal(
                data_source_id,
                Some("client-id"),
                None,
                &format!("http://{addr}/auth"),
                &format!("http://{addr}/token"),
            )
            .await
            .unwrap();
        assert_eq!(token, "access");

        // A cache hit should not hit the network or refresh the token again.
        let cached = manager
            .get_access_token(data_source_id, None, None)
            .await
            .unwrap();
        assert_eq!(cached, "access");
    }

    #[tokio::test]
    async fn fetch_user_info_should_ignore_invalid_id_token_when_id_token_is_invalid() {
        let graph = MockGraphClient {
            result: Ok(serde_json::json!({})),
        };

        let info = fetch_user_info(&graph, "token", Some("totally.invalid.token")).await.unwrap();
        assert_eq!(info.display_name, "Unknown");
        assert_eq!(info.email, None);
    }

    /// Simulate opening the browser: instead of launching a real browser, send an OAuth2 callback to the local redirect URI.
    fn open_browser_and_send_callback(
        redirect_uri: &str,
        callback_query: &str,
    ) -> Result<(), AppError> {
        let port = redirect_uri
            .split(':')
            .last()
            .and_then(|s| s.parse::<u16>().ok())
            .ok_or_else(|| AppError::Auth("Invalid redirect URI port".to_string()))?;

        let query = callback_query.to_string();
        thread::spawn(move || {
            let request = format!(
                "GET /?{query} HTTP/1.1\r\nHost: localhost:{port}\r\n\r\n"
            );
            let mut stream = std::net::TcpStream::connect(("127.0.0.1", port)).unwrap();
            stream.write_all(request.as_bytes()).unwrap();
            stream.flush().unwrap();
        });

        Ok(())
    }

    #[tokio::test]
    async fn start_auth_flow_internal_should_complete_flow_when_callback_and_token_server_succeed() {
        let manager = OnedriveTokenManager::new();
        let graph = MockGraphClient {
            result: Ok(serde_json::json!({
                "displayName": "Flow User",
                "mail": "flow@example.com",
            })),
        };

        let addr = start_token_server(true);

        let result = manager
            .start_auth_flow_internal(
                None,
                None,
                &format!("http://{addr}/auth"),
                &format!("http://{addr}/token"),
                &graph,
                |_, redirect_uri| open_browser_and_send_callback(redirect_uri, "code=flow-code&state=xyz"),
            )
            .await
            .unwrap();

        assert_eq!(result.access_token, "access");
        assert_eq!(result.refresh_token, "refresh");
        assert_eq!(result.user_info.display_name, "Flow User");
        assert_eq!(result.user_info.email, Some("flow@example.com".to_string()));
    }

    #[tokio::test]
    async fn start_auth_flow_internal_should_propagate_browser_error_when_browser_opener_fails() {
        let manager = OnedriveTokenManager::new();
        let graph = MockGraphClient {
            result: Ok(serde_json::json!({})),
        };
        let addr = start_token_server(true);

        let err = manager
            .start_auth_flow_internal(
                None,
                None,
                &format!("http://{addr}/auth"),
                &format!("http://{addr}/token"),
                &graph,
                |_, _| Err(AppError::Auth("browser blocked".to_string())),
            )
            .await
            .unwrap_err();

        assert!(format!("{err}").contains("browser blocked"));
    }

    #[tokio::test]
    async fn start_auth_flow_internal_should_fail_when_token_server_omits_refresh_token() {
        let manager = OnedriveTokenManager::new();
        let graph = MockGraphClient {
            result: Ok(serde_json::json!({})),
        };

        // The local token endpoint returns only an access_token, not a refresh_token.
        let addr = start_token_server_with_body(
            200,
            serde_json::json!({
                "access_token": "access",
                "token_type": "Bearer",
                "expires_in": 3600,
            })
            .to_string(),
        );

        let err = manager
            .start_auth_flow_internal(
                None,
                None,
                &format!("http://{addr}/auth"),
                &format!("http://{addr}/token"),
                &graph,
                |_, redirect_uri| open_browser_and_send_callback(redirect_uri, "code=no-refresh&state=xyz"),
            )
            .await
            .unwrap_err();

        assert!(format!("{err}").contains("did not return a refresh token"));
    }
}
