use super::*;
use std::sync::{Arc, Mutex};

#[tokio::test]
async fn onedrive_probes_the_real_scoped_root_and_preserves_error_categories() {
    use http::{Request, Response, StatusCode};
    use opendal::{Buffer, HttpBody, HttpTransport, HttpTransporter, OperationContext};
    #[derive(Clone)]
    struct Graph {
        status: StatusCode,
        requests: Arc<Mutex<Vec<String>>>,
    }
    impl HttpTransport for Graph {
        async fn fetch(&self, request: Request<Buffer>) -> opendal::Result<Response<HttpBody>> {
            self.requests
                .lock()
                .unwrap()
                .push(request.uri().to_string());
            let body = if self.status.is_success() {
                br#"{"id":"folder","name":"Books","folder":{"childCount":0},"parentReference":{"path":"/drive/root:/base","driveId":"drive","id":"parent"},"eTag":"fixture","size":0,"lastModifiedDateTime":"2026-10-24T00:00:00Z"}"#.to_vec()
            } else {
                br#"{"error":{"code":"itemNotFound"}}"#.to_vec()
            };
            let length = body.len() as u64;
            Ok(Response::builder()
                .status(self.status)
                .body(HttpBody::new(
                    futures_util::stream::iter([Ok(Buffer::from(body))]),
                    Some(length),
                ))
                .unwrap())
        }
    }
    for (status, expected) in [
        (StatusCode::OK, None),
        (StatusCode::NOT_FOUND, Some(Problem::PathUnavailable)),
        (StatusCode::FORBIDDEN, Some(Problem::Credential)),
        (StatusCode::SERVICE_UNAVAILABLE, Some(Problem::Connectivity)),
    ] {
        let requests = Arc::new(Mutex::new(Vec::new()));
        let operator = opendal::Operator::new(
            opendal::services::Onedrive::default()
                .access_token("test-only")
                .root("/base/Books"),
        )
        .unwrap()
        .with_context(
            OperationContext::new().with_http_transport(HttpTransporter::new(Graph {
                status,
                requests: requests.clone(),
            })),
        );
        let result = check_remote_root(&operator).await;
        assert_eq!(
            result.as_ref().err().map(|value| value.0),
            expected,
            "{result:?}"
        );
        let requests = requests.lock().unwrap();
        assert_eq!(requests.len(), 1);
        assert!(requests[0].contains("/base/Books"), "{}", requests[0]);
    }
}
