use std::{collections::BTreeMap, sync::LazyLock, time::Duration};

use oauth2::{CsrfToken, PkceCodeChallenge};
use serde::{Deserialize, Serialize};
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::TcpListener,
    sync::Mutex,
};

use super::credentials;
use crate::error::AppError;

pub const GOOGLE_CLIENT_ID: &str =
    "679889280827-pga92ae49ril56ni1pt6mu5757t4mup1.apps.googleusercontent.com";
// Dropbox App Keys are public application identifiers. Set this once for the
// desktop build; users authenticate with Dropbox and never enter the key.
pub const DROPBOX_APP_KEY: &str = "bhqdm55o1hhmbxu";
static TOKEN_LOCK: LazyLock<Mutex<()>> = LazyLock::new(|| Mutex::new(()));

#[derive(Clone, Copy, Debug, Deserialize, Serialize, specta::Type)]
#[serde(rename_all = "lowercase")]
pub enum CloudProvider {
    Gdrive,
    Dropbox,
}

impl CloudProvider {
    pub fn client_id(self) -> &'static str {
        match self {
            Self::Gdrive => GOOGLE_CLIENT_ID,
            Self::Dropbox => DROPBOX_APP_KEY,
        }
    }

    fn token_url(self) -> &'static str {
        match self {
            Self::Gdrive => "https://oauth2.googleapis.com/token",
            Self::Dropbox => "https://api.dropboxapi.com/oauth2/token",
        }
    }
}

#[derive(Deserialize)]
struct Tokens {
    access_token: String,
    refresh_token: Option<String>,
    expires_in: u64,
}

pub struct CloudAuthorization {
    pub secrets: BTreeMap<String, String>,
    pub account_id: String,
    pub name: String,
    pub email: Option<String>,
}

fn client() -> Result<reqwest::Client, AppError> {
    Ok(reqwest::Client::builder()
        .timeout(Duration::from_secs(60))
        .redirect(reqwest::redirect::Policy::none())
        .build()?)
}

fn now() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

fn store_tokens(fields: &mut BTreeMap<String, String>, tokens: Tokens) {
    fields.insert("accessToken".into(), tokens.access_token);
    fields.insert(
        "expiresAt".into(),
        now()
            .saturating_add(tokens.expires_in.saturating_sub(120))
            .to_string(),
    );
    if let Some(token) = tokens.refresh_token.filter(|value| !value.is_empty()) {
        fields.insert("refreshToken".into(), token);
    }
}

async fn exchange(provider: CloudProvider, params: &[(&str, &str)]) -> Result<Tokens, AppError> {
    let response = client()?
        .post(provider.token_url())
        .form(params)
        .send()
        .await?;
    if !response.status().is_success() {
        let status = response.status();
        let error: serde_json::Value = response.json().await.unwrap_or_default();
        return Err(AppError::Auth(format!(
            "OAUTH_TOKEN_REJECTED: {status} {}",
            error["error"].as_str().unwrap_or("unknown")
        )));
    }
    let tokens: Tokens = response.json().await?;
    if tokens.access_token.is_empty() {
        return Err(AppError::Auth("OAUTH_ACCESS_TOKEN_REQUIRED".into()));
    }
    Ok(tokens)
}

pub async fn access_token(
    provider: CloudProvider,
    client_id: &str,
    account: &str,
) -> Result<String, AppError> {
    let _lock = TOKEN_LOCK.lock().await;
    let mut fields = credentials::read_remote_credentials(account)?;
    if fields
        .get("expiresAt")
        .and_then(|s| s.parse::<u64>().ok())
        .is_some_and(|expiry| expiry > now())
    {
        if let Some(token) = fields.get("accessToken").filter(|token| !token.is_empty()) {
            return Ok(token.clone());
        }
    }
    let refresh = fields
        .get("refreshToken")
        .ok_or_else(|| AppError::Auth("OAUTH_REFRESH_TOKEN_REQUIRED".into()))?;
    let params = vec![
        ("grant_type", "refresh_token"),
        ("client_id", client_id),
        ("refresh_token", refresh),
    ];
    let tokens = exchange(provider, &params).await?;
    store_tokens(&mut fields, tokens);
    credentials::save_remote_credentials(account, &fields)?;
    Ok(fields["accessToken"].clone())
}

pub async fn authorize(
    provider: CloudProvider,
    client_id: &str,
) -> Result<CloudAuthorization, AppError> {
    if client_id.trim().is_empty() {
        return Err(AppError::Config("OAUTH_CLIENT_ID_REQUIRED".into()));
    }
    let bind = match provider {
        CloudProvider::Gdrive => "127.0.0.1:0",
        CloudProvider::Dropbox => "127.0.0.1:53683",
    };
    let listener = TcpListener::bind(bind).await?;
    let redirect = format!(
        "http://127.0.0.1:{}/oauth/callback",
        listener.local_addr()?.port()
    );
    let (challenge, verifier) = PkceCodeChallenge::new_random_sha256();
    let state = CsrfToken::new_random();
    let mut url = url::Url::parse(match provider {
        CloudProvider::Gdrive => "https://accounts.google.com/o/oauth2/v2/auth",
        CloudProvider::Dropbox => "https://www.dropbox.com/oauth2/authorize",
    })
    .expect("valid OAuth endpoint");
    url.query_pairs_mut().extend_pairs([
        ("client_id", client_id),
        ("response_type", "code"),
        ("redirect_uri", &redirect),
        ("state", state.secret()),
        ("code_challenge", challenge.as_str()),
        ("code_challenge_method", "S256"),
    ]);
    match provider {
        CloudProvider::Gdrive => {
            url.query_pairs_mut().extend_pairs([
                (
                    "scope",
                    "openid email profile https://www.googleapis.com/auth/drive",
                ),
                ("access_type", "offline"),
                ("prompt", "consent"),
            ]);
        }
        CloudProvider::Dropbox => {
            url.query_pairs_mut().extend_pairs([
            ("token_access_type", "offline"), ("scope", "account_info.read files.metadata.read files.metadata.write files.content.read files.content.write"),
        ]);
        }
    }
    open::that(url.as_str()).map_err(|_| AppError::Auth("OAUTH_BROWSER_FAILED".into()))?;
    let code = tokio::time::timeout(Duration::from_secs(300), callback(listener, state.secret()))
        .await
        .map_err(|_| AppError::Auth("OAUTH_TIMEOUT".into()))??;
    let params = vec![
        ("grant_type", "authorization_code"),
        ("client_id", client_id),
        ("redirect_uri", &redirect),
        ("code", &code),
        ("code_verifier", verifier.secret()),
    ];
    let tokens = exchange(provider, &params).await?;
    if tokens
        .refresh_token
        .as_ref()
        .is_none_or(|token| token.is_empty())
    {
        return Err(AppError::Auth("OAUTH_REFRESH_TOKEN_REQUIRED".into()));
    }
    let request = match provider {
        CloudProvider::Gdrive => client()?.get("https://openidconnect.googleapis.com/v1/userinfo"),
        CloudProvider::Dropbox => {
            client()?.post("https://api.dropboxapi.com/2/users/get_current_account")
        }
    };
    let user: serde_json::Value = request
        .bearer_auth(&tokens.access_token)
        .send()
        .await?
        .error_for_status()?
        .json()
        .await?;
    let (id, name) = match provider {
        CloudProvider::Gdrive => (&user["sub"], &user["name"]),
        CloudProvider::Dropbox => (&user["account_id"], &user["name"]["display_name"]),
    };
    let account_id = id
        .as_str()
        .filter(|id| !id.is_empty())
        .ok_or_else(|| AppError::Auth("OAUTH_ACCOUNT_ID_REQUIRED".into()))?
        .to_owned();
    let mut secrets = BTreeMap::new();
    store_tokens(&mut secrets, tokens);
    Ok(CloudAuthorization {
        secrets,
        account_id,
        name: name.as_str().unwrap_or("Cloud storage").into(),
        email: user["email"].as_str().map(Into::into),
    })
}

async fn callback(listener: TcpListener, expected_state: &str) -> Result<String, AppError> {
    loop {
        let (mut socket, _) = listener.accept().await?;
        let target =
            tokio::time::timeout(Duration::from_secs(5), request_target(&mut socket)).await;
        let path = match target {
            Ok(Ok(Some(path))) => path,
            _ => continue,
        };
        let result = parse_callback(&path, expected_state);
        let (status, text) = if result.as_ref().is_some_and(|value| value.is_ok()) {
            ("200 OK", "Authorization complete. Return to MyReader.")
        } else {
            ("400 Bad Request", "Invalid authorization callback.")
        };
        let response = format!("HTTP/1.1 {status}\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{text}", text.len());
        let _ = socket.write_all(response.as_bytes()).await;
        if let Some(result) = result {
            return result;
        }
    }
}

async fn request_target(socket: &mut tokio::net::TcpStream) -> std::io::Result<Option<String>> {
    let mut bytes = Vec::new();
    let mut chunk = [0u8; 1024];
    while bytes.len() < 8192 {
        let count = socket.read(&mut chunk).await?;
        if count == 0 {
            return Ok(None);
        }
        bytes.extend_from_slice(&chunk[..count]);
        if bytes.windows(4).any(|bytes| bytes == b"\r\n\r\n") {
            let request = String::from_utf8_lossy(&bytes);
            let mut words = request
                .lines()
                .next()
                .unwrap_or_default()
                .split_whitespace();
            if words.next() != Some("GET") {
                return Ok(None);
            }
            return Ok(words
                .next()
                .filter(|path| path.starts_with('/'))
                .map(ToOwned::to_owned));
        }
    }
    Ok(None)
}

fn parse_callback(path: &str, expected_state: &str) -> Option<Result<String, AppError>> {
    let url = url::Url::parse(&format!("http://127.0.0.1{path}")).ok()?;
    if url.path() != "/oauth/callback" {
        return None;
    }
    let params = url.query_pairs().collect::<BTreeMap<_, _>>();
    if params.get("state").map(|value| value.as_ref()) != Some(expected_state) {
        return None;
    }
    if params.contains_key("error") {
        return Some(Err(AppError::Auth("OAUTH_ACCESS_DENIED".into())));
    }
    Some(
        params
            .get("code")
            .filter(|code| !code.is_empty())
            .map(|code| code.to_string())
            .ok_or_else(|| AppError::Auth("OAUTH_CODE_REQUIRED".into())),
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn callback_requires_matching_state_path_and_code() {
        assert!(parse_callback("/oauth/callback?code=x&state=bad", "good").is_none());
        assert!(parse_callback("/other?code=x&state=good", "good").is_none());
        assert_eq!(
            parse_callback("/oauth/callback?code=a%2Bb&state=good", "good")
                .unwrap()
                .unwrap(),
            "a+b"
        );
        assert!(
            parse_callback("/oauth/callback?error=access_denied&state=good", "good")
                .unwrap()
                .is_err()
        );
        assert!(parse_callback("/oauth/callback?state=good", "good")
            .unwrap()
            .is_err());
    }

    #[test]
    fn oauth_providers_bundle_required_application_credentials() {
        assert!(!CloudProvider::Gdrive.client_id().is_empty());
        assert!(!CloudProvider::Dropbox.client_id().is_empty());
    }
}
