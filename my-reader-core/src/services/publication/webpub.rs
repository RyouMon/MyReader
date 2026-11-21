use super::invalid;
use crate::CoreError;
use serde_json::{json, Value};
use std::{
    collections::BTreeMap,
    fs::{self, File},
    io::{self, Write},
    path::{Path, PathBuf},
    sync::Mutex,
};
use tempfile::TempDir;
use zip::{write::SimpleFileOptions, CompressionMethod, ZipWriter};

pub(super) const LIMIT: usize = 128 * 1024 * 1024;
const MAX_FILES: usize = 16_384;
pub(super) const XHTML: &str = "application/xhtml+xml";
const PROFILE: &str = "https://readium.org/webpub-manifest/profiles/epub";
static PUBLISH: Mutex<()> = Mutex::new(());

pub(super) struct Package {
    stage: TempDir,
    destination: PathBuf,
    identifier: String,
    title: String,
    entries: BTreeMap<String, u64>,
    size: usize,
}

pub(super) fn cached(path: &Path) -> bool {
    let check = || -> Option<bool> {
        let sizes: BTreeMap<String, u64> =
            serde_json::from_slice(&fs::read(path.join("sizes.json")).ok()?).ok()?;
        Some(
            sizes.contains_key("book.webpub")
                && sizes.contains_key("manifest.json")
                && sizes.iter().all(|(name, size)| {
                    valid_name(name)
                        && fs::metadata(path.join(name))
                            .is_ok_and(|m| m.is_file() && m.len() == *size)
                }),
        )
    };
    check() == Some(true)
}

fn valid_name(name: &str) -> bool {
    !name.is_empty()
        && name.len() < 100
        && name
            .bytes()
            .all(|c| c.is_ascii_alphanumeric() || b"-_.".contains(&c))
        && !name.starts_with('.')
        && !name.ends_with('.')
}

impl Package {
    pub(super) fn new(destination: &Path, digest: &str, title: String) -> Result<Self, CoreError> {
        let root = destination
            .parent()
            .ok_or_else(|| invalid("INVALID_CACHE"))?;
        fs::create_dir_all(root)?;
        Ok(Self {
            stage: tempfile::Builder::new()
                .prefix(".prepare-")
                .tempdir_in(root)?,
            destination: destination.into(),
            identifier: format!("urn:sha256:{digest}"),
            title,
            entries: BTreeMap::new(),
            size: 0,
        })
    }

    pub(super) fn add(&mut self, name: &str, bytes: &[u8]) -> Result<(), CoreError> {
        let allowed = name.starts_with("chapter-") || name.starts_with("asset-");
        if !valid_name(name)
            || !allowed
            || self.entries.contains_key(name)
            || self.entries.len() >= MAX_FILES
            || self.size.saturating_add(bytes.len()) > LIMIT * 2
        {
            return Err(invalid("INVALID_RESOURCE"));
        }
        fs::write(self.stage.path().join(name), bytes)?;
        self.entries.insert(name.into(), bytes.len() as u64);
        self.size += bytes.len();
        Ok(())
    }

    pub(super) fn finish(mut self, mut manifest: Value) -> Result<(), CoreError> {
        let order = manifest["readingOrder"]
            .as_array()
            .filter(|v| !v.is_empty())
            .ok_or_else(|| invalid("EMPTY_BOOK"))?;
        if !order.iter().all(|l| l["type"] == XHTML) {
            return Err(invalid("INVALID_READING_ORDER"));
        }
        let resources = manifest["resources"].as_array().into_iter().flatten();
        for link in order.iter().chain(resources) {
            if !link["href"]
                .as_str()
                .is_some_and(|href| self.entries.contains_key(href))
            {
                return Err(invalid("MISSING_RESOURCE"));
            }
        }
        manifest["@context"] = json!("https://readium.org/webpub-manifest/context.jsonld");
        if !manifest["metadata"].is_object() {
            manifest["metadata"] = json!({});
        }
        manifest["metadata"]["conformsTo"] = json!([PROFILE]);
        manifest["metadata"]["identifier"] = json!(self.identifier);
        if manifest["metadata"]["title"]
            .as_str()
            .unwrap_or("")
            .is_empty()
        {
            manifest["metadata"]["title"] = json!(self.title);
        }
        let stage = self.stage.path();
        let bytes = serde_json::to_vec(&manifest).map_err(|e| invalid(e.to_string()))?;
        fs::write(stage.join("manifest.json"), &bytes)?;
        self.entries
            .insert("manifest.json".into(), bytes.len() as u64);
        let mut zip = ZipWriter::new(File::create(stage.join("book.webpub"))?);
        for name in self.entries.keys() {
            let method = if name.ends_with(".json")
                || name.ends_with(".xhtml")
                || name.ends_with(".css")
                || name.ends_with(".svg")
            {
                CompressionMethod::Deflated
            } else {
                CompressionMethod::Stored
            };
            zip.start_file(
                name,
                SimpleFileOptions::default().compression_method(method),
            )
            .map_err(|e| invalid(e.to_string()))?;
            io::copy(&mut File::open(stage.join(name))?, &mut zip)?;
        }
        let mut output = zip.finish().map_err(|e| invalid(e.to_string()))?;
        output.flush()?;
        self.entries
            .insert("book.webpub".into(), output.metadata()?.len());
        drop(output);
        fs::write(
            stage.join("sizes.json"),
            serde_json::to_vec(&self.entries).map_err(|e| invalid(e.to_string()))?,
        )?;
        let _guard = PUBLISH.lock().unwrap_or_else(|e| e.into_inner());
        if cached(&self.destination) {
            return Ok(());
        }
        if self.destination.exists() {
            fs::rename(&self.destination, stage.join("obsolete"))?;
        }
        fs::rename(stage, &self.destination)?;
        let obsolete = self.destination.join("obsolete");
        if obsolete.exists() {
            fs::remove_dir_all(obsolete)?;
        }
        Ok(())
    }
}
