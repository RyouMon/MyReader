use std::{
    collections::{BTreeMap, BTreeSet, HashMap},
    sync::{Arc, Mutex},
};
use warp::{
    http::{Method, Response},
    Filter,
};

pub struct MockS3 {
    pub endpoint: String,
    pub objects: Arc<Mutex<BTreeMap<String, Vec<u8>>>>,
    task: tokio::task::JoinHandle<()>,
}

impl Drop for MockS3 {
    fn drop(&mut self) {
        self.task.abort();
    }
}

impl MockS3 {
    pub async fn start() -> Self {
        let objects = Arc::new(Mutex::new(BTreeMap::<String, Vec<u8>>::new()));
        let state = objects.clone();
        let route = warp::any()
            .and(warp::method())
            .and(warp::path::full())
            .and(warp::query::<HashMap<String, String>>())
            .and(warp::header::optional::<String>("authorization"))
            .and(warp::body::bytes())
            .map(
                move |method: Method,
                      path: warp::path::FullPath,
                      query: HashMap<String, String>,
                      authorization: Option<String>,
                      body: bytes::Bytes| {
                    if !authorization.is_some_and(|value| {
                        value.starts_with("AWS4-HMAC-SHA256 Credential=test-key/")
                    }) {
                        return Response::builder().status(403).body(Vec::new()).unwrap();
                    }
                    let key = percent_encoding::percent_decode_str(
                        path.as_str().trim_start_matches("/books/"),
                    )
                    .decode_utf8()
                    .unwrap()
                    .into_owned();
                    let mut objects = state.lock().unwrap();
                    if method == Method::GET && query.contains_key("list-type") {
                        let prefix = query.get("prefix").map(String::as_str).unwrap_or_default();
                        return Response::builder()
                            .header("content-type", "application/xml")
                            .body(listing(&objects, prefix).into_bytes())
                            .unwrap();
                    }
                    match method {
                        Method::PUT => {
                            objects.insert(key, body.to_vec());
                            Response::builder()
                                .header("etag", "\"test-etag\"")
                                .body(Vec::new())
                                .unwrap()
                        }
                        Method::DELETE => {
                            objects.remove(&key);
                            Response::builder().status(204).body(Vec::new()).unwrap()
                        }
                        Method::HEAD | Method::GET => match objects.get(&key) {
                            Some(bytes) => Response::builder()
                                .header("etag", "\"test-etag\"")
                                .header("content-length", bytes.len())
                                .body(if method == Method::HEAD {
                                    Vec::new()
                                } else {
                                    bytes.clone()
                                })
                                .unwrap(),
                            None => Response::builder().status(404).body(Vec::new()).unwrap(),
                        },
                        _ => Response::builder().status(405).body(Vec::new()).unwrap(),
                    }
                },
            );
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let endpoint = format!("http://{}", listener.local_addr().unwrap());
        let task = tokio::spawn(warp::serve(route).incoming(listener).run());
        Self {
            endpoint,
            objects,
            task,
        }
    }
}

fn listing(objects: &BTreeMap<String, Vec<u8>>, prefix: &str) -> String {
    let directories: BTreeSet<_> = objects
        .keys()
        .filter_map(|key| {
            let rest = key.strip_prefix(prefix)?;
            let (name, _) = rest.split_once('/')?;
            Some(format!("{prefix}{name}/"))
        })
        .collect();
    let mut entries = directories
        .iter()
        .map(|directory| format!("<CommonPrefixes><Prefix>{directory}</Prefix></CommonPrefixes>"))
        .collect::<String>();
    for (key, bytes) in objects {
        if key
            .strip_prefix(prefix)
            .is_some_and(|rest| !rest.contains('/'))
        {
            entries.push_str(&format!("<Contents><Key>{key}</Key><Size>{}</Size><ETag>test-etag</ETag><LastModified>2026-01-01T00:00:00Z</LastModified></Contents>", bytes.len()));
        }
    }
    format!("<ListBucketResult xmlns=\"http://s3.amazonaws.com/doc/2006-03-01/\"><Name>books</Name><Prefix>{prefix}</Prefix><IsTruncated>false</IsTruncated>{entries}</ListBucketResult>")
}
