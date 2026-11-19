use std::{collections::HashMap, time::Duration};

use super::{join_remote_path, normalize_remote_path, transport::build_storage_operator};
use crate::{
    models::{LibraryStorageConfig, RemoteDownloadRequest},
    CoreError,
};

pub(crate) async fn download_request(
    storage: &LibraryStorageConfig,
    path: &str,
) -> Result<RemoteDownloadRequest, CoreError> {
    let path = normalize_remote_path(path)?;
    if path.is_empty() {
        return Err(CoreError::Config("REMOTE_FILE_PATH_REQUIRED".into()));
    }
    match storage {
        LibraryStorageConfig::S3 { .. } => {
            let request = build_storage_operator(storage)?
                .presign_read(&path, Duration::from_secs(3600))
                .await?;
            let headers = request
                .header()
                .iter()
                .map(|(name, value)| {
                    value
                        .to_str()
                        .map(|value| (name.to_string(), value.to_owned()))
                        .map_err(|_| CoreError::Storage("INVALID_DOWNLOAD_HEADER".into()))
                })
                .collect::<Result<_, _>>()?;
            Ok(RemoteDownloadRequest {
                url: request.uri().to_string(),
                headers,
            })
        }
        LibraryStorageConfig::Dropbox { access_token, root } => {
            let path = format!(
                "/{}",
                join_remote_path(root.as_deref().unwrap_or_default(), &path)?
            );
            let response = client()?
                .post("https://api.dropboxapi.com/2/files/get_temporary_link")
                .bearer_auth(access_token)
                .json(&serde_json::json!({"path": path}))
                .send()
                .await?
                .error_for_status()?;
            let value: serde_json::Value = response.json().await?;
            let url = value["link"]
                .as_str()
                .filter(|url| url.starts_with("https://"))
                .ok_or_else(|| CoreError::Storage("INVALID_DOWNLOAD_URL".into()))?;
            Ok(RemoteDownloadRequest {
                url: url.into(),
                headers: HashMap::new(),
            })
        }
        LibraryStorageConfig::Gdrive {
            access_token,
            root,
            root_folder_id,
        } => {
            let path = join_remote_path(root.as_deref().unwrap_or_default(), &path)?;
            let id = drive_file_id(access_token, root_folder_id.as_deref(), &path).await?;
            let mut url =
                url::Url::parse("https://www.googleapis.com/drive/v3/files/").expect("Drive URL");
            url.path_segments_mut()
                .expect("Drive URL is a base")
                .pop_if_empty()
                .push(&id);
            url.set_query(Some("alt=media"));
            Ok(RemoteDownloadRequest {
                url: url.into(),
                headers: HashMap::from([(
                    "Authorization".into(),
                    format!("Bearer {access_token}"),
                )]),
            })
        }
        _ => Err(CoreError::Config(
            "NATIVE_DOWNLOAD_REQUEST_UNSUPPORTED".into(),
        )),
    }
}

fn client() -> Result<reqwest::Client, CoreError> {
    Ok(crate::infrastructure::http::client_builder()
        .connect_timeout(Duration::from_secs(15))
        .timeout(Duration::from_secs(60))
        .redirect(reqwest::redirect::Policy::none())
        .build()?)
}

async fn drive_file_id(
    token: &str,
    root_id: Option<&str>,
    path: &str,
) -> Result<String, CoreError> {
    let client = client()?;
    let mut parent = root_id.unwrap_or("root").to_owned();
    let segments = path.split('/').collect::<Vec<_>>();
    for (index, segment) in segments.iter().enumerate() {
        let name = segment.replace('\\', "\\\\").replace('\'', "\\'");
        let parent_query = parent.replace('\\', "\\\\").replace('\'', "\\'");
        let mut query =
            format!("name = '{name}' and '{parent_query}' in parents and trashed = false");
        if index + 1 < segments.len() {
            query.push_str(" and mimeType = 'application/vnd.google-apps.folder'");
        }
        let mut url =
            url::Url::parse("https://www.googleapis.com/drive/v3/files").expect("Drive URL");
        url.query_pairs_mut()
            .append_pair("q", &query)
            .append_pair("pageSize", "2")
            .append_pair("fields", "nextPageToken,files(id)");
        let response = client
            .get(url)
            .bearer_auth(token)
            .send()
            .await?
            .error_for_status()?;
        parent = unique_drive_file_id(&response.json().await?)?;
    }
    Ok(parent)
}

fn unique_drive_file_id(value: &serde_json::Value) -> Result<String, CoreError> {
    let files = value["files"]
        .as_array()
        .ok_or_else(|| CoreError::Storage("INVALID_GDRIVE_RESPONSE".into()))?;
    if files.len() > 1
        || value["nextPageToken"]
            .as_str()
            .is_some_and(|token| !token.is_empty())
    {
        return Err(CoreError::Storage("GDRIVE_AMBIGUOUS_PATH".into()));
    }
    files
        .first()
        .and_then(|file| file["id"].as_str())
        .filter(|id| !id.is_empty())
        .map(ToOwned::to_owned)
        .ok_or_else(|| CoreError::NotFound("GDRIVE_FILE_NOT_FOUND".into()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn drive_download_never_selects_an_arbitrary_duplicate() {
        assert_eq!(
            unique_drive_file_id(&serde_json::json!({"files": [{"id": "stable-id"}]})).unwrap(),
            "stable-id"
        );
        for response in [
            serde_json::json!({"files": [{"id":"a"}, {"id":"b"}]}),
            serde_json::json!({"files": [{"id":"a"}], "nextPageToken":"more"}),
        ] {
            assert!(unique_drive_file_id(&response)
                .unwrap_err()
                .to_string()
                .contains("GDRIVE_AMBIGUOUS_PATH"));
        }
        assert!(matches!(
            unique_drive_file_id(&serde_json::json!({"files":[]})),
            Err(CoreError::NotFound(_))
        ));
    }

    #[tokio::test]
    async fn s3_download_scopes_and_signs_unicode_paths_without_exposing_secret() {
        let storage = LibraryStorageConfig::S3 {
            endpoint: "https://storage.example.com".into(),
            bucket: "books".into(),
            region: "us-east-1".into(),
            root: Some("/图书/Library".into()),
            virtual_host_style: false,
            access_key_id: "test-key".into(),
            secret_access_key: "test-secret".into(),
            session_token: None,
        };
        let request = download_request(&storage, "作者/Book (1)/book.epub")
            .await
            .unwrap();
        let url = url::Url::parse(&request.url).unwrap();
        assert!(url.path().starts_with("/books/%E5%9B%BE%E4%B9%A6/Library/"));
        assert!(url.query_pairs().any(|(key, _)| key == "X-Amz-Signature"));
        assert!(!request.url.contains("test-secret"));
        assert!(download_request(&storage, "../private").await.is_err());
    }
}
