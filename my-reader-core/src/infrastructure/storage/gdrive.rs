use http::{header, Request, Response, StatusCode};
use opendal::{Buffer, Error, ErrorKind, HttpBody, HttpTransport, HttpTransporter};

pub(super) const SOURCE_ROOT: &str = "__myreader_source__";

/// OpenDAL 0.58 resolves Drive paths by name and returns the newest match.
/// Anchor a selected source to its stable folder ID and reject ambiguous names.
#[derive(Clone)]
pub(super) struct GdriveTransport {
    pub inner: HttpTransporter,
    pub root_folder_id: Option<String>,
}

impl HttpTransport for GdriveTransport {
    async fn fetch(&self, mut request: Request<Buffer>) -> opendal::Result<Response<HttpBody>> {
        let mut url = url::Url::parse(&request.uri().to_string())
            .map_err(|e| Error::new(ErrorKind::Unexpected, "Invalid Drive URL").set_source(e))?;
        let query = url
            .query_pairs()
            .find(|(key, _)| key == "q")
            .map(|(_, value)| value.into_owned());
        let resolving_name = query.as_ref().is_some_and(|q| q.starts_with("name = '"));
        let listing = request.method() == http::Method::GET
            && url.path() == "/drive/v3/files"
            && query.is_some();
        let resolving_root = self.root_folder_id.is_some()
            && query.as_ref().is_some_and(|q| {
                q.starts_with(&format!("name = '{SOURCE_ROOT}' and 'root' in parents"))
                    && q.contains("trashed = false")
            });
        if resolving_root {
            let id = self.root_folder_id.as_deref().unwrap_or_default();
            url.set_path(&format!("/drive/v3/files/{id}"));
            url.set_query(Some("fields=id,name,mimeType,trashed"));
        } else if resolving_name {
            let pairs = url
                .query_pairs()
                .map(|(key, value)| {
                    let value = if key == "pageSize" {
                        "2".into()
                    } else {
                        value.into_owned()
                    };
                    (key.into_owned(), value)
                })
                .collect::<Vec<_>>();
            url.query_pairs_mut().clear().extend_pairs(pairs);
        }
        *request.uri_mut() = url
            .as_str()
            .parse()
            .map_err(|e| Error::new(ErrorKind::Unexpected, "Invalid Drive URI").set_source(e))?;
        let response = self.inner.fetch(request).await?;
        if response.status() != StatusCode::OK || !listing {
            return Ok(response);
        }
        let (parts, mut body) = response.into_parts();
        let bytes = body.to_buffer().await?;
        let mut value: serde_json::Value =
            serde_json::from_slice(&bytes.to_vec()).map_err(|e| {
                Error::new(ErrorKind::Unexpected, "Invalid Drive response").set_source(e)
            })?;
        if resolving_root {
            if value["mimeType"] != "application/vnd.google-apps.folder" || value["trashed"] == true
            {
                return Err(Error::new(ErrorKind::NotFound, "GDRIVE_FOLDER_NOT_FOUND"));
            }
            value["name"] = SOURCE_ROOT.into();
            value = serde_json::json!({ "files": [value] });
        } else if resolving_name
            && (value["files"]
                .as_array()
                .is_some_and(|files| files.len() > 1)
                || value.get("nextPageToken").is_some())
        {
            return Err(Error::new(
                ErrorKind::Unexpected,
                "GDRIVE_AMBIGUOUS_PATH: multiple items have the same name",
            ));
        }
        if !resolving_name {
            // Workspace documents and shortcuts are not downloadable files.
            // They have no byte length; passing them to OpenDAL's file lister
            // makes the whole page fail, including otherwise usable folders.
            if let Some(files) = value["files"].as_array_mut() {
                files.retain(|file| {
                    let mime = file["mimeType"].as_str().unwrap_or_default();
                    !mime.starts_with("application/vnd.google-apps.")
                        || mime == "application/vnd.google-apps.folder"
                });
            }
        }
        let bytes = Buffer::from(serde_json::to_vec(&value).map_err(|e| {
            Error::new(ErrorKind::Unexpected, "Invalid Drive response").set_source(e)
        })?);
        let size = bytes.len() as u64;
        let mut parts = parts;
        parts.headers.remove(header::CONTENT_LENGTH);
        parts.headers.insert(header::CONTENT_LENGTH, size.into());
        Ok(Response::from_parts(
            parts,
            HttpBody::new(futures_util::stream::iter([Ok(bytes)]), Some(size)),
        ))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{Arc, Mutex};

    #[derive(Clone)]
    struct Reply {
        status: StatusCode,
        body: serde_json::Value,
        urls: Arc<Mutex<Vec<url::Url>>>,
    }

    impl HttpTransport for Reply {
        async fn fetch(&self, request: Request<Buffer>) -> opendal::Result<Response<HttpBody>> {
            self.urls
                .lock()
                .unwrap()
                .push(url::Url::parse(&request.uri().to_string()).unwrap());
            let bytes = Buffer::from(serde_json::to_vec(&self.body).unwrap());
            let size = bytes.len() as u64;
            Ok(Response::builder()
                .status(self.status)
                .header(header::CONTENT_LENGTH, size)
                .body(HttpBody::new(
                    futures_util::stream::iter([Ok(bytes)]),
                    Some(size),
                ))
                .unwrap())
        }
    }

    fn request(query: &str) -> Request<Buffer> {
        let mut url = url::Url::parse("https://www.googleapis.com/drive/v3/files").unwrap();
        url.query_pairs_mut()
            .append_pair("q", query)
            .append_pair("pageSize", "1");
        Request::get(url.as_str()).body(Buffer::new()).unwrap()
    }

    fn transport(body: serde_json::Value) -> (GdriveTransport, Arc<Mutex<Vec<url::Url>>>) {
        let urls = Arc::new(Mutex::new(Vec::new()));
        (
            GdriveTransport {
                root_folder_id: Some("chosen-folder".into()),
                inner: HttpTransporter::new(Reply {
                    status: StatusCode::OK,
                    body,
                    urls: urls.clone(),
                }),
            },
            urls,
        )
    }

    #[tokio::test]
    async fn browsing_keeps_folders_and_downloadable_files_without_breaking_pagination() {
        let (transport, _) = transport(serde_json::json!({
            "nextPageToken": "next-page",
            "files": [
                {"id":"doc", "name":"未命名项目", "mimeType":"application/vnd.google-apps.document"},
                {"id":"shortcut", "name":"link", "mimeType":"application/vnd.google-apps.shortcut"},
                {"id":"folder", "name":"书库", "mimeType":"application/vnd.google-apps.folder"},
                {"id":"book", "name":"book.epub", "mimeType":"application/epub+zip", "size":"123"}
            ]
        }));
        let mut response = transport
            .fetch(request("'root' in parents and trashed = false"))
            .await
            .unwrap();
        let value: serde_json::Value =
            serde_json::from_slice(&response.body_mut().to_buffer().await.unwrap().to_vec())
                .unwrap();
        assert_eq!(value["nextPageToken"], "next-page");
        let files = value["files"].as_array().unwrap();
        assert_eq!(files.len(), 2);
        assert_eq!(files[0]["id"], "folder");
        assert_eq!(files[1]["size"], "123");
    }

    #[tokio::test]
    async fn unsupported_documents_still_participate_in_name_conflicts() {
        let (transport, _) = transport(serde_json::json!({"files": [
            {"id":"doc", "mimeType":"application/vnd.google-apps.document"},
            {"id":"folder", "mimeType":"application/vnd.google-apps.folder"}
        ]}));
        assert!(transport
            .fetch(request("name = 'Library' and 'root' in parents"))
            .await
            .is_err());
    }

    #[tokio::test]
    async fn root_id_is_used_even_when_the_remote_folder_is_renamed() {
        let (transport, urls) = transport(serde_json::json!({
            "id":"chosen-folder", "name":"新书库", "mimeType":"application/vnd.google-apps.folder", "trashed":false
        }));
        let query = format!("name = '{SOURCE_ROOT}' and 'root' in parents and trashed = false and mimeType = 'application/vnd.google-apps.folder'");
        let response = transport.fetch(request(&query)).await.unwrap();
        assert_eq!(
            urls.lock().unwrap()[0].path(),
            "/drive/v3/files/chosen-folder"
        );
        let (parts, mut body) = response.into_parts();
        let bytes = body.to_buffer().await.unwrap().to_vec();
        assert_eq!(
            parts.headers[header::CONTENT_LENGTH],
            bytes.len().to_string()
        );
        let value: serde_json::Value = serde_json::from_slice(&bytes).unwrap();
        assert_eq!(value["files"][0]["id"], "chosen-folder");
        assert_eq!(value["files"][0]["name"], SOURCE_ROOT);
    }

    #[tokio::test]
    async fn a_real_child_with_the_virtual_root_name_is_not_redirected() {
        let (transport, urls) = transport(serde_json::json!({"files":[{"id":"child"}]}));
        let query =
            format!("name = '{SOURCE_ROOT}' and 'chosen-folder' in parents and trashed = false");
        transport.fetch(request(&query)).await.unwrap();
        let urls = urls.lock().unwrap();
        assert_eq!(urls[0].path(), "/drive/v3/files");
        assert!(urls[0]
            .query_pairs()
            .any(|(key, value)| key == "pageSize" && value == "2"));
    }

    #[tokio::test]
    async fn duplicates_and_deleted_roots_cannot_resolve_to_a_file() {
        for value in [
            serde_json::json!({"files":[{"id":"a"},{"id":"b"}]}),
            serde_json::json!({"files":[{"id":"a"}],"nextPageToken":"more"}),
        ] {
            let (transport, _) = transport(value);
            let error = match transport
                .fetch(request(
                    "name = '书.epub' and 'parent' in parents and trashed = false",
                ))
                .await
            {
                Ok(_) => panic!("duplicate should be rejected"),
                Err(error) => error,
            };
            assert!(error.to_string().contains("GDRIVE_AMBIGUOUS_PATH"));
        }
        let (transport, _) = transport(
            serde_json::json!({"id":"chosen-folder","mimeType":"application/vnd.google-apps.folder","trashed":true}),
        );
        let error = match transport
            .fetch(request(&format!(
                "name = '{SOURCE_ROOT}' and 'root' in parents and trashed = false"
            )))
            .await
        {
            Ok(_) => panic!("trashed root should be rejected"),
            Err(error) => error,
        };
        assert_eq!(error.kind(), ErrorKind::NotFound);
    }
}
