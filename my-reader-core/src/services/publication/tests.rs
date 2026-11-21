use super::*;
use serde_json::{json, Value};
use std::{
    fs,
    io::{Cursor, Read, Write},
};
use tempfile::tempdir;
use zip::{write::SimpleFileOptions, ZipArchive, ZipWriter};

fn zip_files(files: &[(&str, &[u8])]) -> Vec<u8> {
    let mut z = ZipWriter::new(Cursor::new(Vec::new()));
    for (k, v) in files {
        z.start_file(*k, SimpleFileOptions::default()).unwrap();
        z.write_all(v).unwrap();
    }
    z.finish().unwrap().into_inner()
}

#[tokio::test]
async fn source_format_and_anchors_survive_cache_rebuilds() {
    let dir = tempdir().unwrap();
    let cache = dir.path().join("cache");
    let source = dir.path().join("Journal.md");
    fs::write(
        &source,
        "# Morning\n\n[Later](#dusk)\n\n## Dusk\n\n**River** and <script>unsafe()</script>\n",
    )
    .unwrap();
    let (left, right) = tokio::join!(
        prepare(&source, "md", &cache),
        prepare(&source, "MD", &cache)
    );
    let result = left.unwrap();
    assert_eq!(right.unwrap().directory, result.directory);
    assert!(result.parser_url.is_none());
    let original = fs::read(&source).unwrap();
    let open =
        || ZipArchive::new(fs::File::open(result.directory.join("book.webpub")).unwrap()).unwrap();
    let mut archive = open();
    let manifest: Value =
        serde_json::from_reader(archive.by_name("manifest.json").unwrap()).unwrap();
    assert_eq!(manifest["readingOrder"][1]["type"], webpub::XHTML);
    assert_eq!(
        manifest["metadata"]["conformsTo"][0],
        "https://readium.org/webpub-manifest/profiles/epub"
    );
    assert!(manifest["metadata"]["identifier"]
        .as_str()
        .unwrap()
        .starts_with("urn:sha256:"));
    let mut first = String::new();
    archive
        .by_name("chapter-0000.xhtml")
        .unwrap()
        .read_to_string(&mut first)
        .unwrap();
    assert!(first.contains("chapter-0001.xhtml#dusk"));
    let chapter = result.directory.join("chapter-0001.xhtml");
    let expected = fs::read_to_string(&chapter).unwrap();
    assert!(
        expected.contains("id=\"dusk\"")
            && expected.contains("<strong>River</strong>")
            && !expected.contains("<script>")
    );
    drop(archive);
    fs::remove_file(&chapter).unwrap();
    let rebuilt = prepare(&source, "md", &cache).await.unwrap();
    assert_eq!(rebuilt.directory, result.directory);
    assert_eq!(fs::read_to_string(chapter).unwrap(), expected);
    assert_eq!(fs::read(&source).unwrap(), original);
    fs::write(&source, "a new edition").unwrap();
    assert_ne!(
        prepare(&source, "md", &cache).await.unwrap().directory,
        result.directory
    );
}

#[tokio::test]
async fn decodes_utf16_and_legacy_chinese_text_from_archives() {
    let root = tempdir().unwrap();
    let cache = root.path().join("cache");
    let title = "第一章 打开这本书";
    let mut wide = vec![0xff, 0xfe];
    wide.extend(title.encode_utf16().flat_map(u16::to_le_bytes));
    let chinese = format!("{title}\n这是一本关于历史和科学的中文书。");
    let (legacy, _, _) = encoding_rs::GBK.encode(&chinese);
    for (format, data) in [("TXT", wide), ("TXTZ", zip_files(&[("book.txt", &legacy)]))] {
        let source = root.path().join(format!("book.{format}"));
        fs::write(&source, data).unwrap();
        let result = prepare(&source, format, &cache).await.unwrap();
        assert!(result.parser_url.is_none());
        assert!(
            fs::read_to_string(result.directory.join("chapter-0000.xhtml"))
                .unwrap()
                .contains(title)
        );
    }
}

#[test]
fn rejects_invalid_encrypted_or_non_book_kindle_sources_and_ambiguous_archives() {
    let mut pdb = vec![0u8; 400];
    pdb[60..68].copy_from_slice(b"BOOKMOBI");
    pdb[77] = 2;
    pdb[78..82].copy_from_slice(&96u32.to_be_bytes());
    pdb[86..90].copy_from_slice(&320u32.to_be_bytes());
    pdb[112..116].copy_from_slice(b"MOBI");
    pdb[109] = 1;
    assert!(source::Input::open("AZW", pdb.clone())
        .err()
        .unwrap()
        .to_string()
        .contains("DRM_NOT_SUPPORTED"));
    pdb[109] = 0;
    assert_eq!(source::Input::open("PRC", pdb).unwrap().kind, "mobi");
    for (format, data) in [
        ("PRC", vec![1; 80]),
        ("MOBI", vec![]),
        ("KFX", vec![]),
        ("FBZ", b"invalid".to_vec()),
        ("FB2.ZIP", zip_files(&[("notes.txt", b"notes")])),
        ("HTMLZ", zip_files(&[("../outside.html", b"outside")])),
    ] {
        assert!(source::Input::open(format, data).is_err());
    }
}

#[tokio::test]
async fn parser_session_serves_only_its_book_and_publishes_before_acknowledging() {
    let dir = tempdir().unwrap();
    let src = dir.path().join("book.fb2.zip");
    fs::write(&src, zip_files(&[("novel/book.fb2", b"<FictionBook/>")])).unwrap();
    let publication = prepare(&src, "FB2.ZIP", &dir.path().join("cache"))
        .await
        .unwrap();
    let endpoint = url::Url::parse(publication.parser_url.as_ref().unwrap()).unwrap();
    let client = crate::infrastructure::http::client_builder()
        .no_proxy()
        .build()
        .unwrap();
    let url = |p: &str| endpoint.join(p).unwrap();
    assert_eq!(
        client
            .get(url("input/novel/book.fb2"))
            .send()
            .await
            .unwrap()
            .text()
            .await
            .unwrap(),
        "<FictionBook/>"
    );
    assert_eq!(
        client
            .get(url("/description"))
            .send()
            .await
            .unwrap()
            .status(),
        404
    );
    let description: Value = client
        .get(url("description"))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(description["kind"], "fb2");
    assert_eq!(description["entry"], "novel/book.fb2");
    assert!(client
        .get(endpoint.clone())
        .send()
        .await
        .unwrap()
        .headers()
        .contains_key("content-security-policy"));
    for (name, bytes) in bridge::MODULES {
        assert_eq!(
            client
                .get(url(&format!("module/{name}")))
                .send()
                .await
                .unwrap()
                .bytes()
                .await
                .unwrap()
                .as_ref(),
            *bytes
        );
    }
    assert!(!publication.directory.exists());
    assert_eq!(
        client
            .put(url("output/nonsense"))
            .body("unlisted")
            .send()
            .await
            .unwrap()
            .status(),
        422
    );
    let href = "chapter-0000.xhtml";
    let add = client
        .put(url(&format!("output/{href}")))
        .body("<html/>")
        .send()
        .await
        .unwrap();
    assert!(add.status().is_success());
    let manifest =
        json!({"metadata":{"title":"Hello"},"readingOrder":[{"type":webpub::XHTML,"href":href}]});
    assert!(client
        .post(url("finish"))
        .json(&manifest)
        .send()
        .await
        .unwrap()
        .status()
        .is_success());
    assert!(webpub::cached(&publication.directory));
    let next = prepare(&src, "FB2.ZIP", &dir.path().join("cache"))
        .await
        .unwrap();
    assert!(next.parser_url.is_none());
}

#[test]
fn publication_writer_fails_closed_and_drops_partial_files() {
    let root = tempdir().unwrap();
    let dest = root.path().join("book");
    for manifest in [
        json!({}),
        json!({"readingOrder":[{"href":"missing","type":"application/xhtml+xml"}]}),
        json!({"readingOrder":[{"href":"chapter-x","type":"text/html"}]}),
    ] {
        let mut writer = webpub::Package::new(&dest, "id", "Title".into()).unwrap();
        writer.add("chapter-x", b"one").unwrap();
        assert!(writer.add("chapter-x", b"two").is_err());
        assert!(writer.finish(manifest).is_err());
        assert!(!dest.exists());
        assert_eq!(fs::read_dir(root.path()).unwrap().count(), 0);
    }
}
