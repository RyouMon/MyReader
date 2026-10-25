use super::super::*;
use super::{fixture, request, SyncService, MYREADER_LIBRARY_MARKER_RELATIVE_PATH};
use std::sync::{Arc, Mutex};
use tokio::io::{AsyncReadExt, AsyncWriteExt};

struct Dav {
    endpoint: String,
    requests: Arc<Mutex<Vec<(String, String)>>>,
    task: tokio::task::JoinHandle<()>,
}
impl Drop for Dav {
    fn drop(&mut self) {
        self.task.abort();
    }
}

async fn server(root: PathBuf) -> Dav {
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let endpoint = format!("http://{}/dav", listener.local_addr().unwrap());
    let requests = Arc::new(Mutex::new(Vec::new()));
    let captured = requests.clone();
    let task = tokio::spawn(async move {
        loop {
            let (mut stream, _) = listener.accept().await.unwrap();
            let root = root.clone();
            let requests = captured.clone();
            tokio::spawn(async move {
                let mut bytes = Vec::new();
                let (end, length) = loop {
                    let mut buffer = [0; 8192];
                    let count = stream.read(&mut buffer).await.unwrap();
                    if count == 0 {
                        return;
                    }
                    bytes.extend_from_slice(&buffer[..count]);
                    if let Some(end) = bytes.windows(4).position(|w| w == b"\r\n\r\n") {
                        let headers = String::from_utf8_lossy(&bytes[..end]);
                        let length = headers
                            .lines()
                            .find_map(|line| {
                                line.to_lowercase()
                                    .strip_prefix("content-length: ")
                                    .and_then(|v| v.parse::<usize>().ok())
                            })
                            .unwrap_or(0);
                        break (end + 4, length);
                    }
                };
                while bytes.len() < end + length {
                    let mut buffer = [0; 8192];
                    let count = stream.read(&mut buffer).await.unwrap();
                    if count == 0 {
                        break;
                    }
                    bytes.extend_from_slice(&buffer[..count]);
                }
                let first = String::from_utf8_lossy(&bytes[..end]);
                let mut parts = first.lines().next().unwrap().split_whitespace();
                let method = parts.next().unwrap();
                let path = parts.next().unwrap();
                requests.lock().unwrap().push((method.into(), path.into()));
                let file = root.join(path.trim_start_matches("/dav/"));
                let (status, body) = reply(method, path, &file, &bytes[end..]);
                let response = format!(
                    "HTTP/1.1 {status}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
                    body.len()
                );
                stream.write_all(response.as_bytes()).await.unwrap();
                stream.write_all(&body).await.unwrap();
            });
        }
    });
    Dav {
        endpoint,
        requests,
        task,
    }
}

fn reply(method: &str, path: &str, file: &Path, body: &[u8]) -> (&'static str, Vec<u8>) {
    if path.contains("denied") {
        return ("403 Forbidden", vec![]);
    }
    if path.contains("offline") {
        return ("503 Service Unavailable", vec![]);
    }
    match method {
        "PROPFIND" if file.exists() => {
            let mut xml = format!("<d:multistatus xmlns:d=\"DAV:\">{}", prop(path, file));
            if file.is_dir() {
                for entry in std::fs::read_dir(file).unwrap().flatten() {
                    xml.push_str(&prop(
                        &format!(
                            "{}/{}",
                            path.trim_end_matches('/'),
                            entry.file_name().to_string_lossy()
                        ),
                        &entry.path(),
                    ));
                }
            }
            xml.push_str("</d:multistatus>");
            ("207 Multi-Status", xml.into_bytes())
        }
        "GET" if file.is_file() => ("200 OK", std::fs::read(file).unwrap()),
        "MKCOL" => {
            std::fs::create_dir_all(file).unwrap();
            ("201 Created", vec![])
        }
        "PUT" => {
            std::fs::create_dir_all(file.parent().unwrap()).unwrap();
            std::fs::write(file, body).unwrap();
            ("201 Created", vec![])
        }
        "DELETE" if file.is_file() => {
            std::fs::remove_file(file).unwrap();
            ("204 No Content", vec![])
        }
        _ => ("404 Not Found", vec![]),
    }
}
fn prop(path: &str, file: &Path) -> String {
    let kind = if file.is_dir() { "<d:collection/>" } else { "" };
    let length = std::fs::metadata(file).unwrap().len();
    format!("<d:response><d:href>{path}</d:href><d:propstat><d:prop><d:resourcetype>{kind}</d:resourcetype><d:getcontentlength>{length}</d:getcontentlength><d:getlastmodified>Sat, 24 Oct 2026 00:00:00 GMT</d:getlastmodified></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>")
}

#[tokio::test]
async fn webdav_move_diagnoses_scoped_root_repairs_and_syncs_only_new_location() {
    let (temp, config, library, sidecar) = fixture().await;
    let remote = temp.path().join("remote");
    let target = remote.join("shelf/new/.myreader");
    std::fs::create_dir_all(&target).unwrap();
    std::fs::copy(
        Path::new(&library.path).join(MYREADER_LIBRARY_MARKER_RELATIVE_PATH),
        target.join("library.json"),
    )
    .unwrap();
    let dav = server(remote.clone()).await;
    ConfigService::mutate_config(&config, |config| {
        config.data_sources.push(DataSource::Webdav {
            id: "dav".into(),
            name: "Server".into(),
            endpoint: dav.endpoint.clone(),
            username: "reader".into(),
            enabled: true,
            has_password: true,
            credential_reference: None,
            readonly: None,
            created_at: None,
            root_path: Some("/shelf".into()),
        });
        let library = &mut config.libraries[0];
        library.data_source_id = Some("dav".into());
        library.source_type = Some("webdav".into());
        library.source_path = Some("/old".into());
        Ok(())
    })
    .unwrap();
    let credential = Some(RemoteCredential::Webdav {
        password: "test-only".into(),
    });
    let diagnosis = LibraryService::diagnose_location(
        &config,
        &library.id,
        Path::new(&library.path),
        credential.as_ref(),
    )
    .await
    .unwrap();
    assert_eq!(diagnosis.problem, Some(Problem::PathUnavailable));
    assert_eq!(
        diagnosis.effective_path,
        format!("{}/shelf/old", dav.endpoint)
    );
    let result = LibraryService::relocate(
        &config,
        &library.id,
        &sidecar,
        request(Path::new("/new")),
        credential.as_ref(),
    )
    .await
    .unwrap();
    assert_eq!(result.location.problem, None, "{result:?}");
    assert_eq!(
        result.config.as_ref().unwrap().libraries[0].path,
        library.path
    );
    let storage = SyncService::resolve_library_storage(
        result.config.as_ref().unwrap(),
        &library.id,
        &library.path,
        credential.as_ref(),
    )
    .unwrap();
    SyncService::sync_sidecar(
        &sidecar,
        Path::new(&library.path),
        200,
        crate::models::SidecarSyncMode::Full,
        &storage,
    )
    .await
    .unwrap();
    assert!(!remote.join("shelf/old").exists());
    assert!(remote.join("shelf/new/.myreader/automerge").exists());
    assert!(dav
        .requests
        .lock()
        .unwrap()
        .iter()
        .filter(|(method, _)| method == "PUT" || method == "MKCOL")
        .all(|(_, path)| path.starts_with("/dav/shelf/new/")));
    // Reconfiguration of the data-source base is honored by the post-repair gate.
    ConfigService::mutate_config(&config, |config| {
        if let DataSource::Webdav { root_path, .. } = &mut config.data_sources[0] {
            *root_path = Some("/other".into());
        }
        Ok(())
    })
    .unwrap();
    assert!(access::acquire(&sidecar, &storage).await.is_err());
    let current = ConfigService::load(&config).unwrap().unwrap();
    let storage = SyncService::resolve_library_storage(
        &current,
        &library.id,
        &library.path,
        credential.as_ref(),
    )
    .unwrap();
    assert!(access::acquire(&sidecar, &storage).await.is_ok());
}

#[tokio::test]
async fn webdav_distinguishes_path_source_permission_and_network_failures() {
    let (temp, config, library, _) = fixture().await;
    let remote = temp.path().join("remote");
    std::fs::create_dir_all(remote.join("shelf/empty")).unwrap();
    let dav = server(remote).await;
    let credential = RemoteCredential::Webdav {
        password: "test-only".into(),
    };
    for (base, path, expected) in [
        ("/shelf", "/absent", Problem::PathUnavailable),
        ("/missing-base", "/absent", Problem::DataSource),
        ("/shelf", "/denied", Problem::Credential),
        ("/shelf", "/offline", Problem::Connectivity),
        ("/shelf", "/empty", Problem::InvalidLibrary),
    ] {
        ConfigService::mutate_config(&config, |config| {
            config.data_sources = vec![DataSource::Webdav {
                id: "dav".into(),
                name: "Server".into(),
                endpoint: dav.endpoint.clone(),
                username: "reader".into(),
                enabled: true,
                has_password: true,
                credential_reference: None,
                readonly: None,
                created_at: None,
                root_path: Some(base.into()),
            }];
            let library = &mut config.libraries[0];
            library.data_source_id = Some("dav".into());
            library.source_type = Some("webdav".into());
            library.source_path = Some(path.into());
            Ok(())
        })
        .unwrap();
        let before = std::fs::read(&config).unwrap();
        let location = LibraryService::diagnose_location(
            &config,
            &library.id,
            Path::new(&library.path),
            Some(&credential),
        )
        .await
        .unwrap();
        assert_eq!(location.problem, Some(expected), "{path}: {location:?}");
        assert_eq!(std::fs::read(&config).unwrap(), before);
    }
}
