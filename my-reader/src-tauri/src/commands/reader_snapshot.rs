use super::reader_image::ReaderCaptureRect;

pub async fn capture(
    window: &tauri::WebviewWindow,
    rect: ReaderCaptureRect,
) -> Result<Vec<u8>, String> {
    if [rect.x, rect.y, rect.width, rect.height]
        .iter()
        .any(|v| !v.is_finite())
        || rect.x < 0.0
        || rect.y < 0.0
        || rect.width <= 0.0
        || rect.height <= 0.0
    {
        return Err("INVALID_CAPTURE_RECT".into());
    }
    capture_platform(window, rect).await
}

#[cfg(target_os = "macos")]
async fn capture_platform(
    window: &tauri::WebviewWindow,
    rect: ReaderCaptureRect,
) -> Result<Vec<u8>, String> {
    use objc2::{AnyThread, MainThreadMarker};
    use objc2_app_kit::{NSBitmapImageFileType, NSBitmapImageRep, NSImage};
    use objc2_foundation::{NSDictionary, NSError, NSPoint, NSRect, NSSize};
    use objc2_web_kit::{WKSnapshotConfiguration, WKWebView};
    let (tx, rx) = tokio::sync::oneshot::channel();
    window
        .with_webview(move |webview| unsafe {
            let mtm = MainThreadMarker::new().expect("with_webview runs on the main thread");
            let view = &*webview.inner().cast::<WKWebView>();
            let config = WKSnapshotConfiguration::new(mtm);
            config.setRect(NSRect::new(
                NSPoint::new(rect.x, rect.y),
                NSSize::new(rect.width, rect.height),
            ));
            let sender = std::sync::Mutex::new(Some(tx));
            let callback = block2::RcBlock::new(move |image: *mut NSImage, error: *mut NSError| {
                let result = if !error.is_null() || image.is_null() {
                    Err("WEBVIEW_SNAPSHOT_FAILED".to_string())
                } else {
                    (*image)
                        .TIFFRepresentation()
                        .and_then(|data| {
                            NSBitmapImageRep::initWithData(NSBitmapImageRep::alloc(), &data)
                        })
                        .and_then(|bitmap| {
                            bitmap.representationUsingType_properties(
                                NSBitmapImageFileType::PNG,
                                &NSDictionary::new(),
                            )
                        })
                        .map(|data| data.to_vec())
                        .ok_or_else(|| "SNAPSHOT_ENCODING_FAILED".to_string())
                };
                if let Some(tx) = sender.lock().unwrap().take() {
                    let _ = tx.send(result);
                }
            });
            view.takeSnapshotWithConfiguration_completionHandler(Some(&config), &callback);
        })
        .map_err(|e| e.to_string())?;
    rx.await.map_err(|e| e.to_string())?
}

#[cfg(target_os = "windows")]
async fn capture_platform(
    window: &tauri::WebviewWindow,
    rect: ReaderCaptureRect,
) -> Result<Vec<u8>, String> {
    use webview2_com::{
        CapturePreviewCompletedHandler,
        Microsoft::Web::WebView2::Win32::COREWEBVIEW2_CAPTURE_PREVIEW_IMAGE_FORMAT_PNG,
    };
    use windows::Win32::{
        System::Com::{STATFLAG_NONAME, STREAM_SEEK_SET},
        UI::Shell::SHCreateMemStream,
    };
    let scale = window.scale_factor().map_err(|e| e.to_string())?;
    let (tx, rx) = tokio::sync::oneshot::channel();
    window
        .with_webview(move |webview| unsafe {
            let result = (|| -> windows::core::Result<()> {
                let stream =
                    SHCreateMemStream(None).ok_or_else(windows::core::Error::from_win32)?;
                let output = stream.clone();
                let handler = CapturePreviewCompletedHandler::create(Box::new(move |result| {
                    let bytes = (|| -> windows::core::Result<Vec<u8>> {
                        result?;
                        let mut stat = Default::default();
                        output.Stat(&mut stat, STATFLAG_NONAME)?;
                        output.Seek(0, STREAM_SEEK_SET, None)?;
                        let mut bytes = vec![0; stat.cbSize as usize];
                        output
                            .Read(bytes.as_mut_ptr().cast(), bytes.len() as u32, None)
                            .ok()?;
                        Ok(bytes)
                    })()
                    .map_err(|e| e.to_string());
                    let _ = tx.send(bytes);
                    Ok(())
                }));
                webview.controller().CoreWebView2()?.CapturePreview(
                    COREWEBVIEW2_CAPTURE_PREVIEW_IMAGE_FORMAT_PNG,
                    &stream,
                    &handler,
                )?;
                Ok(())
            })();
            if let Err(error) = result {
                log::error!("CapturePreview: {error}");
            }
        })
        .map_err(|e| e.to_string())?;
    let bytes = rx.await.map_err(|e| e.to_string())??;
    let image = image::load_from_memory(&bytes).map_err(|e| e.to_string())?;
    let x = (rect.x * scale).round() as u32;
    let y = (rect.y * scale).round() as u32;
    let width = ((rect.width * scale).round() as u32).min(image.width().saturating_sub(x));
    let height = ((rect.height * scale).round() as u32).min(image.height().saturating_sub(y));
    if width == 0 || height == 0 {
        return Err("EMPTY_CAPTURE_RECT".into());
    }
    let mut png = std::io::Cursor::new(Vec::new());
    image
        .crop_imm(x, y, width, height)
        .write_to(&mut png, image::ImageFormat::Png)
        .map_err(|e| e.to_string())?;
    Ok(png.into_inner())
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
async fn capture_platform(
    _: &tauri::WebviewWindow,
    _: ReaderCaptureRect,
) -> Result<Vec<u8>, String> {
    Err("READER_IMAGE_UNSUPPORTED".into())
}
