use std::cmp::Ordering;
use std::fs::File;
use std::io::{Cursor, Read, Write};
use std::path::Path;

use hayro::{
    hayro_interpret::{hayro_syntax::Pdf, InterpreterSettings},
    render,
    vello_cpu::color::palette::css::WHITE,
    RenderCache, RenderSettings,
};
use image::{imageops::FilterType, DynamicImage, ImageReader, Limits, RgbImage};
use quick_xml::events::Event;
use quick_xml::Reader;
use quick_xml::XmlVersion;
use rbook::Epub;
use serde::Deserialize;
use tracing::warn;
use zip::ZipArchive;

const MAX_ARCHIVE_RESOURCE_BYTES: usize = 64 * 1024 * 1024;
const MAX_XHTML_BYTES: usize = 2 * 1024 * 1024;
const MAX_PDF_BYTES: u64 = 512 * 1024 * 1024;
const COVER_MAX_WIDTH: u32 = 1200;
const COVER_MAX_HEIGHT: u32 = 1600;
const PDF_COVER_MAX_WIDTH: u32 = 600;
const PDF_COVER_MAX_HEIGHT: u32 = 800;

#[derive(Debug, Default)]
pub(crate) struct PublicationAnalysis {
    pub title: Option<String>,
    pub authors: Vec<String>,
    pub cover_jpeg: Option<Vec<u8>>,
}

pub(crate) async fn analyze_publication_metadata(
    source_path: &Path,
    format: &str,
) -> PublicationAnalysis {
    analyze_publication_part(source_path, format, false).await
}

pub(crate) async fn generate_publication_cover(
    source_path: &Path,
    format: &str,
) -> Option<Vec<u8>> {
    analyze_publication_part(source_path, format, true)
        .await
        .cover_jpeg
}

async fn analyze_publication_part(
    source_path: &Path,
    format: &str,
    include_cover: bool,
) -> PublicationAnalysis {
    let source_path = source_path.to_path_buf();
    let format = format.to_owned();
    let task_path = source_path.clone();
    let task_format = format.clone();
    match tokio::task::spawn_blocking(move || {
        analyze_format(&task_path, &task_format, include_cover)
    })
    .await
    {
        Ok(Ok(analysis)) => analysis,
        Ok(Err(error)) => {
            warn!(path = %source_path.display(), format, error, "Unable to analyze imported publication");
            PublicationAnalysis::default()
        }
        Err(error) => {
            warn!(path = %source_path.display(), format, %error, "Imported publication analysis task failed");
            PublicationAnalysis::default()
        }
    }
}

#[cfg(test)]
fn analyze_sync(source_path: &Path, format: &str) -> Result<PublicationAnalysis, String> {
    let mut analysis = analyze_format(source_path, format, false)?;
    analysis.cover_jpeg = analyze_format(source_path, format, true)?.cover_jpeg;
    Ok(analysis)
}

fn analyze_format(
    source_path: &Path,
    format: &str,
    include_cover: bool,
) -> Result<PublicationAnalysis, String> {
    match format {
        "EPUB" => analyze_epub(source_path, include_cover),
        "CBZ" => analyze_cbz(source_path, include_cover),
        "PDF" => analyze_pdf(source_path, include_cover),
        _ => Ok(PublicationAnalysis::default()),
    }
}

fn analyze_epub(source_path: &Path, include_cover: bool) -> Result<PublicationAnalysis, String> {
    let epub = Epub::open(source_path).map_err(|error| error.to_string())?;
    let metadata = epub.metadata();
    let title = metadata.title().and_then(|title| cleaned(title.value()));
    let authors = metadata
        .creators()
        .filter_map(|creator| cleaned(creator.value()))
        .collect();
    let cover_jpeg = include_cover.then(|| epub_cover_jpeg(&epub)).flatten();
    Ok(PublicationAnalysis {
        title,
        authors,
        cover_jpeg,
    })
}

fn epub_cover_jpeg(epub: &Epub) -> Option<Vec<u8>> {
    if let Some(cover) = epub
        .manifest()
        .cover_image()
        .and_then(read_epub_resource)
        .and_then(normalize_cover)
    {
        return Some(cover);
    }

    let first_page = epub.spine().iter().find(|entry| entry.is_linear())?;
    let page_resource = first_page.manifest_entry()?;
    if page_resource.media_type().starts_with("image/") {
        return read_epub_resource(page_resource).and_then(normalize_cover);
    }
    let page_bytes = read_epub_resource_limited(page_resource, MAX_XHTML_BYTES)?;
    let page = String::from_utf8_lossy(&page_bytes);
    let image_href = first_image_href(&page)?;
    let resolved = resolve_epub_href(page_resource.href().decode().as_ref(), &image_href)?;
    let image = epub.manifest().images().find(|entry| {
        normalize_absolute_href(entry.href().decode().as_ref()).as_deref() == Some(&resolved)
    })?;
    read_epub_resource(image).and_then(normalize_cover)
}

fn read_epub_resource(entry: rbook::epub::manifest::EpubManifestEntry<'_>) -> Option<Vec<u8>> {
    read_epub_resource_limited(entry, MAX_ARCHIVE_RESOURCE_BYTES)
}

fn read_epub_resource_limited(
    entry: rbook::epub::manifest::EpubManifestEntry<'_>,
    limit: usize,
) -> Option<Vec<u8>> {
    let mut output = LimitedWriter::new(limit);
    entry.copy_bytes(&mut output).ok()?;
    Some(output.into_inner())
}

fn first_image_href(document: &str) -> Option<String> {
    let mut reader = Reader::from_str(document);
    reader.config_mut().trim_text(true);
    loop {
        match reader.read_event() {
            Ok(Event::Start(element) | Event::Empty(element)) => {
                let local_name = element.local_name();
                let attribute_name = match local_name.as_ref() {
                    b"img" => b"src".as_slice(),
                    b"image" => b"href".as_slice(),
                    _ => continue,
                };
                for attribute in element.attributes().flatten() {
                    if attribute.key.local_name().as_ref() != attribute_name {
                        continue;
                    }
                    let value = attribute
                        .decoded_and_normalized_value(XmlVersion::Implicit1_0, reader.decoder())
                        .ok()?
                        .into_owned();
                    if !value.trim().is_empty() {
                        return Some(value);
                    }
                }
            }
            Ok(Event::Eof) | Err(_) => return None,
            _ => {}
        }
    }
}

fn resolve_epub_href(page_href: &str, image_href: &str) -> Option<String> {
    let image_href = image_href
        .split(['?', '#'])
        .next()?
        .trim()
        .replace('\\', "/");
    if image_href.is_empty()
        || image_href.starts_with("//")
        || image_href
            .split('/')
            .next()
            .is_some_and(|part| part.contains(':'))
    {
        return None;
    }
    let joined = if image_href.starts_with('/') {
        image_href
    } else {
        let parent = page_href.rsplit_once('/').map_or("", |(parent, _)| parent);
        format!("{parent}/{image_href}")
    };
    normalize_absolute_href(&joined)
}

fn normalize_absolute_href(href: &str) -> Option<String> {
    let mut components = Vec::new();
    for component in href.split(['?', '#']).next()?.split('/') {
        match component {
            "" | "." => {}
            ".." => {
                components.pop()?;
            }
            component => components.push(component),
        }
    }
    Some(format!("/{}", components.join("/")))
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "PascalCase")]
struct ComicInfo {
    title: Option<String>,
    writer: Option<String>,
}

fn analyze_cbz(source_path: &Path, include_cover: bool) -> Result<PublicationAnalysis, String> {
    let file = File::open(source_path).map_err(|error| error.to_string())?;
    let mut archive = ZipArchive::new(file).map_err(|error| error.to_string())?;
    let mut comic_info_index = None;
    let mut images = Vec::new();
    for index in 0..archive.len() {
        let entry = archive.by_index(index).map_err(|error| error.to_string())?;
        if entry.is_dir() {
            continue;
        }
        let name = entry.name().replace('\\', "/");
        let file_name = name.rsplit('/').next().unwrap_or_default();
        if file_name.eq_ignore_ascii_case("ComicInfo.xml") {
            comic_info_index.get_or_insert(index);
        } else if is_supported_image_name(file_name)
            && !name.starts_with("__MACOSX/")
            && !file_name.starts_with('.')
        {
            images.push((name, index));
        }
    }

    let comic_info = comic_info_index
        .and_then(|index| read_zip_entry(&mut archive, index, MAX_XHTML_BYTES))
        .and_then(|bytes| quick_xml::de::from_reader::<_, ComicInfo>(bytes.as_slice()).ok())
        .unwrap_or_default();
    images.sort_by(|left, right| natural_cmp(&left.0, &right.0));
    let cover_jpeg = include_cover
        .then(|| {
            images
                .first()
                .and_then(|(_, index)| {
                    read_zip_entry(&mut archive, *index, MAX_ARCHIVE_RESOURCE_BYTES)
                })
                .and_then(normalize_cover)
        })
        .flatten();
    Ok(PublicationAnalysis {
        title: comic_info.title.as_deref().and_then(cleaned),
        authors: comic_info
            .writer
            .as_deref()
            .and_then(cleaned)
            .into_iter()
            .collect(),
        cover_jpeg,
    })
}

fn read_zip_entry<R: Read + std::io::Seek>(
    archive: &mut ZipArchive<R>,
    index: usize,
    limit: usize,
) -> Option<Vec<u8>> {
    let entry = archive.by_index(index).ok()?;
    if entry.size() > limit as u64 {
        return None;
    }
    let mut bytes = Vec::with_capacity(entry.size() as usize);
    entry.take(limit as u64 + 1).read_to_end(&mut bytes).ok()?;
    (bytes.len() <= limit).then_some(bytes)
}

fn is_supported_image_name(name: &str) -> bool {
    name.rsplit_once('.').is_some_and(|(_, extension)| {
        matches!(
            extension.to_ascii_lowercase().as_str(),
            "gif" | "jpeg" | "jpg" | "png" | "webp"
        )
    })
}

fn natural_cmp(left: &str, right: &str) -> Ordering {
    let mut left = left.as_bytes().iter().copied().peekable();
    let mut right = right.as_bytes().iter().copied().peekable();
    loop {
        match (left.peek().copied(), right.peek().copied()) {
            (None, None) => return Ordering::Equal,
            (None, Some(_)) => return Ordering::Less,
            (Some(_), None) => return Ordering::Greater,
            (Some(a), Some(b)) if a.is_ascii_digit() && b.is_ascii_digit() => {
                let left_number = take_number(&mut left);
                let right_number = take_number(&mut right);
                let ordering = left_number
                    .trim_start_matches('0')
                    .len()
                    .cmp(&right_number.trim_start_matches('0').len())
                    .then_with(|| {
                        left_number
                            .trim_start_matches('0')
                            .cmp(right_number.trim_start_matches('0'))
                    })
                    .then_with(|| left_number.len().cmp(&right_number.len()));
                if ordering != Ordering::Equal {
                    return ordering;
                }
            }
            (Some(a), Some(b)) => {
                left.next();
                right.next();
                let ordering = a.to_ascii_lowercase().cmp(&b.to_ascii_lowercase());
                if ordering != Ordering::Equal {
                    return ordering;
                }
            }
        }
    }
}

fn take_number(iter: &mut std::iter::Peekable<impl Iterator<Item = u8>>) -> String {
    let mut value = String::new();
    while let Some(byte) = iter.peek().copied().filter(u8::is_ascii_digit) {
        iter.next();
        value.push(char::from(byte));
    }
    value
}

fn analyze_pdf(source_path: &Path, include_cover: bool) -> Result<PublicationAnalysis, String> {
    let metadata = std::fs::metadata(source_path).map_err(|error| error.to_string())?;
    if metadata.len() > MAX_PDF_BYTES {
        return Err("PDF is too large for import-time analysis".into());
    }
    let bytes = std::fs::read(source_path).map_err(|error| error.to_string())?;
    let pdf = Pdf::new(bytes).map_err(|error| format!("{error:?}"))?;
    let title = pdf.metadata().title.as_deref().and_then(decode_pdf_string);
    let authors = pdf
        .metadata()
        .author
        .as_deref()
        .and_then(decode_pdf_string)
        .into_iter()
        .collect();
    let cover_jpeg = include_cover
        .then(|| {
            pdf.pages().iter().next().and_then(|page| {
                let (width, height) = page.render_dimensions();
                let scale = (PDF_COVER_MAX_WIDTH as f32 / width)
                    .min(PDF_COVER_MAX_HEIGHT as f32 / height)
                    .max(0.01);
                let pixmap = render(
                    page,
                    &RenderCache::new(),
                    &InterpreterSettings::default(),
                    &RenderSettings {
                        x_scale: scale,
                        y_scale: scale,
                        bg_color: WHITE,
                        ..RenderSettings::default()
                    },
                );
                let mut image =
                    RgbImage::new(u32::from(pixmap.width()), u32::from(pixmap.height()));
                for (source, target) in pixmap.data().iter().zip(image.pixels_mut()) {
                    let background = 255 - source.a;
                    target[0] = source.r.saturating_add(background);
                    target[1] = source.g.saturating_add(background);
                    target[2] = source.b.saturating_add(background);
                }
                encode_rgb_jpeg(image)
            })
        })
        .flatten();
    Ok(PublicationAnalysis {
        title,
        authors,
        cover_jpeg,
    })
}

fn decode_pdf_string(bytes: &[u8]) -> Option<String> {
    let decoded = if let Some(bytes) = bytes.strip_prefix(&[0xfe, 0xff]) {
        let units = bytes
            .chunks_exact(2)
            .map(|pair| u16::from_be_bytes([pair[0], pair[1]]));
        char::decode_utf16(units)
            .map(|value| value.unwrap_or(char::REPLACEMENT_CHARACTER))
            .collect()
    } else if let Some(bytes) = bytes.strip_prefix(&[0xff, 0xfe]) {
        let units = bytes
            .chunks_exact(2)
            .map(|pair| u16::from_le_bytes([pair[0], pair[1]]));
        char::decode_utf16(units)
            .map(|value| value.unwrap_or(char::REPLACEMENT_CHARACTER))
            .collect()
    } else {
        String::from_utf8_lossy(bytes).into_owned()
    };
    cleaned(&decoded)
}

fn normalize_cover(bytes: Vec<u8>) -> Option<Vec<u8>> {
    if bytes.is_empty() || bytes.len() > MAX_ARCHIVE_RESOURCE_BYTES {
        return None;
    }
    let mut reader = ImageReader::new(Cursor::new(bytes))
        .with_guessed_format()
        .ok()?;
    let mut limits = Limits::default();
    limits.max_image_width = Some(20_000);
    limits.max_image_height = Some(20_000);
    limits.max_alloc = Some(256 * 1024 * 1024);
    reader.limits(limits);
    let image = reader.decode().ok()?;
    let image = if image.width() > COVER_MAX_WIDTH || image.height() > COVER_MAX_HEIGHT {
        image.resize(COVER_MAX_WIDTH, COVER_MAX_HEIGHT, FilterType::Lanczos3)
    } else {
        image
    };
    encode_jpeg_on_white(image)
}

fn encode_jpeg_on_white(image: DynamicImage) -> Option<Vec<u8>> {
    let rgba = image.to_rgba8();
    let mut rgb = RgbImage::new(rgba.width(), rgba.height());
    for (source, target) in rgba.pixels().zip(rgb.pixels_mut()) {
        let alpha = u16::from(source[3]);
        for channel in 0..3 {
            let value = (u16::from(source[channel]) * alpha + 255 * (255 - alpha) + 127) / 255;
            target[channel] = value as u8;
        }
    }
    encode_rgb_jpeg(rgb)
}

fn encode_rgb_jpeg(image: RgbImage) -> Option<Vec<u8>> {
    let mut jpeg = Vec::new();
    image::codecs::jpeg::JpegEncoder::new_with_quality(&mut jpeg, 85)
        .encode_image(&DynamicImage::ImageRgb8(image))
        .ok()?;
    Some(jpeg)
}

fn cleaned(value: &str) -> Option<String> {
    let value =
        value.trim_matches(|character: char| character.is_whitespace() || character == '\0');
    (!value.is_empty()).then(|| value.to_owned())
}

struct LimitedWriter {
    bytes: Vec<u8>,
    limit: usize,
}

impl LimitedWriter {
    fn new(limit: usize) -> Self {
        Self {
            bytes: Vec::new(),
            limit,
        }
    }

    fn into_inner(self) -> Vec<u8> {
        self.bytes
    }
}

impl Write for LimitedWriter {
    fn write(&mut self, buffer: &[u8]) -> std::io::Result<usize> {
        if self.bytes.len().saturating_add(buffer.len()) > self.limit {
            return Err(std::io::Error::other(
                "publication resource exceeds import limit",
            ));
        }
        self.bytes.extend_from_slice(buffer);
        Ok(buffer.len())
    }

    fn flush(&mut self) -> std::io::Result<()> {
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use std::io::{Cursor, Write};

    use image::{DynamicImage, ImageFormat, Rgb, RgbImage};
    use zip::{write::SimpleFileOptions, CompressionMethod, ZipWriter};

    use super::{analyze_sync, natural_cmp, resolve_epub_href};

    fn png(color: [u8; 3]) -> Vec<u8> {
        let image = DynamicImage::ImageRgb8(RgbImage::from_pixel(8, 12, Rgb(color)));
        let mut bytes = Cursor::new(Vec::new());
        image.write_to(&mut bytes, ImageFormat::Png).unwrap();
        bytes.into_inner()
    }

    fn write_zip(path: &std::path::Path, entries: &[(&str, &[u8], CompressionMethod)]) {
        let file = std::fs::File::create(path).unwrap();
        let mut archive = ZipWriter::new(file);
        for (name, bytes, compression) in entries {
            archive
                .start_file(
                    *name,
                    SimpleFileOptions::default().compression_method(*compression),
                )
                .unwrap();
            archive.write_all(bytes).unwrap();
        }
        archive.finish().unwrap();
    }

    fn write_pdf(path: &std::path::Path) {
        let objects = [
            b"<< /Type /Catalog /Pages 2 0 R >>".as_slice(),
            b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>".as_slice(),
            b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 300] /Resources << >> /Contents 4 0 R >>".as_slice(),
            b"<< /Length 32 >>\nstream\n1 0 0 rg 0 0 200 300 re f\nendstream".as_slice(),
            b"<< /Title (Core PDF) /Author (Ada Lovelace) >>".as_slice(),
        ];
        let mut pdf = b"%PDF-1.7\n".to_vec();
        let mut offsets = vec![0];
        for (index, object) in objects.iter().enumerate() {
            offsets.push(pdf.len());
            writeln!(&mut pdf, "{} 0 obj", index + 1).unwrap();
            pdf.extend_from_slice(object);
            pdf.extend_from_slice(b"\nendobj\n");
        }
        let xref = pdf.len();
        write!(&mut pdf, "xref\n0 {}\n", objects.len() + 1).unwrap();
        pdf.extend_from_slice(b"0000000000 65535 f \n");
        for offset in offsets.into_iter().skip(1) {
            writeln!(&mut pdf, "{offset:010} 00000 n ").unwrap();
        }
        write!(
            &mut pdf,
            "trailer\n<< /Size {} /Root 1 0 R /Info 5 0 R >>\nstartxref\n{xref}\n%%EOF\n",
            objects.len() + 1
        )
        .unwrap();
        std::fs::write(path, pdf).unwrap();
    }

    #[test]
    fn should_sort_page_numbers_naturally_when_comic_entries_are_compared() {
        let mut pages = ["page10.jpg", "page02.jpg", "page1.jpg"];
        pages.sort_by(|left, right| natural_cmp(left, right));

        assert_eq!(pages, ["page1.jpg", "page02.jpg", "page10.jpg"]);
    }

    #[test]
    fn should_resolve_parent_segments_when_epub_page_references_an_image() {
        assert_eq!(
            resolve_epub_href("/OEBPS/text/cover.xhtml", "../images/cover.jpg#image"),
            Some("/OEBPS/images/cover.jpg".into())
        );
    }

    #[test]
    fn should_extract_metadata_and_first_page_image_when_epub_has_no_declared_cover() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("source.epub");
        let cover = png([210, 30, 20]);
        write_zip(
            &path,
            &[
                (
                    "mimetype",
                    b"application/epub+zip",
                    CompressionMethod::Stored,
                ),
                (
                    "META-INF/container.xml",
                    br#"<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>"#,
                    CompressionMethod::Deflated,
                ),
                (
                    "OEBPS/content.opf",
                    br#"<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="id">urn:uuid:test</dc:identifier><dc:title>The Metadata Title</dc:title><dc:creator>Octavia E. Butler</dc:creator><dc:language>en</dc:language><meta property="dcterms:modified">2026-08-05T00:00:00Z</meta></metadata><manifest><item id="page" href="text/cover.xhtml" media-type="application/xhtml+xml"/><item id="image" href="images/front.png" media-type="image/png"/></manifest><spine><itemref idref="page"/></spine></package>"#,
                    CompressionMethod::Deflated,
                ),
                (
                    "OEBPS/text/cover.xhtml",
                    br#"<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml"><body><img src="../images/front.png"/></body></html>"#,
                    CompressionMethod::Deflated,
                ),
                (
                    "OEBPS/images/front.png",
                    cover.as_slice(),
                    CompressionMethod::Deflated,
                ),
            ],
        );

        let analysis = analyze_sync(&path, "EPUB").unwrap();

        assert_eq!(analysis.title.as_deref(), Some("The Metadata Title"));
        assert_eq!(analysis.authors, ["Octavia E. Butler"]);
        assert!(analysis.cover_jpeg.as_ref().is_some_and(|cover| {
            cover.starts_with(&[0xff, 0xd8]) && image::load_from_memory(cover).is_ok()
        }));
    }

    #[test]
    fn should_extract_comic_info_and_naturally_first_page_when_cbz_is_analyzed() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("source.cbz");
        let page_two = png([220, 20, 10]);
        let page_ten = png([10, 20, 220]);
        write_zip(
            &path,
            &[
                (
                    "ComicInfo.xml",
                    br#"<?xml version="1.0"?><ComicInfo><Title>Saga Volume One</Title><Writer>Brian K. Vaughan</Writer></ComicInfo>"#,
                    CompressionMethod::Deflated,
                ),
                (
                    "page10.png",
                    page_ten.as_slice(),
                    CompressionMethod::Deflated,
                ),
                (
                    "page2.png",
                    page_two.as_slice(),
                    CompressionMethod::Deflated,
                ),
            ],
        );

        let analysis = analyze_sync(&path, "CBZ").unwrap();
        let cover = image::load_from_memory(analysis.cover_jpeg.as_ref().unwrap())
            .unwrap()
            .to_rgb8();

        assert_eq!(analysis.title.as_deref(), Some("Saga Volume One"));
        assert_eq!(analysis.authors, ["Brian K. Vaughan"]);
        assert!(cover.get_pixel(0, 0)[0] > cover.get_pixel(0, 0)[2]);
    }

    #[test]
    fn should_extract_info_metadata_and_render_first_page_when_pdf_is_analyzed() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("source.pdf");
        write_pdf(&path);

        let analysis = analyze_sync(&path, "PDF").unwrap();
        let cover = image::load_from_memory(analysis.cover_jpeg.as_ref().unwrap()).unwrap();

        assert_eq!(analysis.title.as_deref(), Some("Core PDF"));
        assert_eq!(analysis.authors, ["Ada Lovelace"]);
        assert!(cover.width() > 0 && cover.width() <= 1200);
        assert!(cover.height() > 0 && cover.height() <= 1600);
    }
}
