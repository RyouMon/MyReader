use http::{header, Request, Response};
use opendal::{Buffer, Error, ErrorKind, HttpBody, HttpTransport, HttpTransporter};

/// OpenDAL 0.58 uses Dropbox's basename as the entire listed path, including
/// recursive listings. Restore paths relative to the operator's root.
#[derive(Clone)]
pub(super) struct DropboxTransport {
    pub inner: HttpTransporter,
    pub root: String,
}

impl HttpTransport for DropboxTransport {
    async fn fetch(&self, request: Request<Buffer>) -> opendal::Result<Response<HttpBody>> {
        let listing = matches!(
            request.uri().path(),
            "/2/files/list_folder" | "/2/files/list_folder/continue"
        );
        let response = self.inner.fetch(request).await?;
        if !listing || !response.status().is_success() {
            return Ok(response);
        }
        let (mut parts, mut body) = response.into_parts();
        let mut value: serde_json::Value =
            serde_json::from_slice(&body.to_buffer().await?.to_vec()).map_err(|error| {
                Error::new(ErrorKind::Unexpected, "Invalid Dropbox listing").set_source(error)
            })?;
        if let Some(entries) = value["entries"].as_array_mut() {
            for entry in entries {
                let path = entry["path_display"].as_str().ok_or_else(|| {
                    Error::new(ErrorKind::Unexpected, "Dropbox listing has no path")
                })?;
                entry["name"] = relative_path(&self.root, path)?.into();
            }
        }
        let bytes = Buffer::from(serde_json::to_vec(&value).map_err(|error| {
            Error::new(ErrorKind::Unexpected, "Invalid Dropbox listing").set_source(error)
        })?);
        let size = bytes.len() as u64;
        parts.headers.insert(header::CONTENT_LENGTH, size.into());
        Ok(Response::from_parts(
            parts,
            HttpBody::new(futures_util::stream::iter([Ok(bytes)]), Some(size)),
        ))
    }
}

fn relative_path(root: &str, path: &str) -> opendal::Result<String> {
    let invalid = || Error::new(ErrorKind::Unexpected, "Dropbox listing is outside its root");
    let mut components = path.trim_matches('/').split('/');
    for expected in root.trim_matches('/').split('/').filter(|s| !s.is_empty()) {
        if components
            .next()
            .is_none_or(|actual| actual.to_lowercase() != expected.to_lowercase())
        {
            return Err(invalid());
        }
    }
    let remaining = components.collect::<Vec<_>>();
    if remaining.is_empty()
        || remaining
            .iter()
            .any(|part| part.is_empty() || *part == "." || *part == "..")
    {
        return Err(invalid());
    }
    Ok(remaining.join("/"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use opendal::{OperationContext, Operator};
    use serde_json::json;

    #[derive(Clone)]
    struct Listing;

    impl HttpTransport for Listing {
        async fn fetch(&self, request: Request<Buffer>) -> opendal::Result<Response<HttpBody>> {
            let continued = request.uri().path().ends_with("/continue");
            let directory = if continued { "second" } else { "first" };
            let body = json!({
                "entries": [{
                    ".tag": "file", "name": "chunk", "size": 3,
                    "client_modified": "2026-11-11T00:00:00Z",
                    "path_display": format!("/Library/中文/.myreader/automerge/doc/{directory}/chunk")
                }],
                "cursor": "next", "has_more": !continued
            });
            let bytes = Buffer::from(serde_json::to_vec(&body).unwrap());
            let size = bytes.len() as u64;
            Ok(Response::builder()
                .body(HttpBody::new(
                    futures_util::stream::iter([Ok(bytes)]),
                    Some(size),
                ))
                .unwrap())
        }
    }

    #[tokio::test]
    async fn recursive_listing_preserves_nested_paths_across_pages() {
        let root = "/library/中文/";
        let operator = Operator::new(
            opendal::services::Dropbox::default()
                .root(root)
                .access_token("test"),
        )
        .unwrap()
        .with_context(
            OperationContext::new().with_http_transport(HttpTransporter::new(DropboxTransport {
                inner: HttpTransporter::new(Listing),
                root: root.into(),
            })),
        );
        let keys = crate::sync::storage::StorageAdapter::new(&operator)
            .list_range(&["doc".into()])
            .await
            .unwrap();
        assert_eq!(
            keys,
            vec![
                vec!["doc", "first", "chunk"],
                vec!["doc", "second", "chunk"]
            ]
        );
    }

    #[test]
    fn paths_remain_scoped_without_losing_filename_case() {
        assert_eq!(
            relative_path("/", "/Books/中文.epub").unwrap(),
            "Books/中文.epub"
        );
        assert_eq!(
            relative_path("/BOOKS/", "/Books/中文.epub").unwrap(),
            "中文.epub"
        );
        for path in [
            "/Bookstore/other",
            "/Books/../other",
            "/Books/",
            "/Books//other",
        ] {
            assert!(relative_path("/Books", path).is_err(), "{path}");
        }
    }
}
