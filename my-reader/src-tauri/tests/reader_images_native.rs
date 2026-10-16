#[cfg(any(target_os = "macos", target_os = "windows"))]
fn main() {
    use base64::Engine;
    use my_reader_lib::commands::reader_image::{
        reader_image_action, ReaderCaptureRect, ReaderImageAction,
    };
    use std::sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    };
    use tauri::{Manager, RunEvent, WebviewUrl, WebviewWindowBuilder};
    use tauri_plugin_clipboard_manager::ClipboardExt;

    let result = Arc::new(Mutex::new(None));
    let outcome = result.clone();
    let mut context = tauri::test::mock_context(tauri::test::noop_assets());
    context.config_mut().identifier = "com.myreader.image-coverage".into();
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(move |app| {
            let started = Arc::new(AtomicBool::new(false));
            WebviewWindowBuilder::new(
                app,
                "image-test",
                WebviewUrl::External("about:blank".parse().unwrap()),
            )
            .inner_size(400.0, 300.0)
            .on_page_load(move |webview, payload| {
                eprintln!(
                    "native image test: page {:?} ({})",
                    payload.event(),
                    payload.url().scheme()
                );
                if payload.url().scheme() != "data"
                    || payload.event() != tauri::webview::PageLoadEvent::Finished
                    || started.swap(true, Ordering::SeqCst)
                {
                    return;
                }
                let window = webview.get_webview_window("image-test").unwrap();
                let app = webview.app_handle().clone();
                let outcome = outcome.clone();
                tauri::async_runtime::spawn(async move {
                    let test = async {
                        // WKWebView/WebView2 need a presented frame before capture.
                        tokio::time::sleep(std::time::Duration::from_millis(500)).await;
                        let rectangle = ReaderCaptureRect {
                            x: 100.0,
                            y: 0.0,
                            width: 100.0,
                            height: 100.0,
                        };
                        eprintln!("native image test: capturing rendered fixture");
                        let path = reader_image_action(
                            app.clone(),
                            window.clone(),
                            ReaderImageAction::PrepareShare,
                            "Author-Book-2.png".into(),
                            None,
                            Some(rectangle),
                        )
                        .await?
                        .unwrap();
                        eprintln!("native image test: capture completed");
                        let bytes = std::fs::read(&path)?;
                        let image = image::load_from_memory(&bytes).unwrap().into_rgba8();
                        assert_eq!(image.width(), image.height());
                        assert_eq!(
                            image.get_pixel(image.width() / 2, image.height() / 2).0,
                            [0, 0, 255, 255]
                        );
                        assert!(path.ends_with("Author-Book-2.png"));

                        let encoded = base64::engine::general_purpose::STANDARD.encode(&bytes);
                        let copied = reader_image_action(
                            app.clone(),
                            window.clone(),
                            ReaderImageAction::Copy,
                            "Book-2.png".into(),
                            Some(encoded.clone()),
                            None,
                        )
                        .await?;
                        eprintln!("native image test: clipboard write completed");
                        assert_eq!(copied.as_deref(), Some("copied"));
                        let clipboard = app.clipboard().read_image().unwrap();
                        assert_eq!(clipboard.rgba(), image.as_raw());

                        let second = reader_image_action(
                            app.clone(),
                            window.clone(),
                            ReaderImageAction::PrepareShare,
                            "Author-Book-2.png".into(),
                            Some(encoded),
                            None,
                        )
                        .await?
                        .unwrap();
                        assert_ne!(path, second);
                        assert_eq!(std::fs::read(second)?, bytes);
                        for data in [None, Some("invalid base64!".into())] {
                            assert!(reader_image_action(
                                app.clone(),
                                window.clone(),
                                ReaderImageAction::Copy,
                                "Book-1.png".into(),
                                data,
                                None
                            )
                            .await
                            .is_err());
                        }
                        assert!(reader_image_action(
                            app.clone(),
                            window.clone(),
                            ReaderImageAction::Copy,
                            "Book-1.png".into(),
                            Some(base64::engine::general_purpose::STANDARD.encode(b"not an image")),
                            None
                        )
                        .await
                        .is_err());
                        let invalid = ReaderCaptureRect {
                            x: -1.0,
                            y: 0.0,
                            width: 100.0,
                            height: 100.0,
                        };
                        assert!(reader_image_action(
                            app.clone(),
                            window,
                            ReaderImageAction::PrepareShare,
                            "Book-1.png".into(),
                            None,
                            Some(invalid)
                        )
                        .await
                        .is_err());
                        Ok::<(), my_reader_lib::AppError>(())
                    }
                    .await;
                    eprintln!("native image test: completed with {test:?}");
                    *outcome.lock().unwrap() = Some(test.map_err(|error| error.to_string()));
                    app.exit(0);
                });
            })
            .build()?;
            // A failed callback must fail the test instead of hanging CI.
            let handle = app.handle().clone();
            std::thread::spawn(move || {
                std::thread::sleep(std::time::Duration::from_secs(45));
                handle.exit(1);
            });
            Ok(())
        })
        .build(context)
        .unwrap();
    app.run_return(|app, event| {
        if let RunEvent::Ready = event {
            // Load only after Tauri registers the webview so its load events can be delivered.
            let html = "data:text/html,<html><body style='margin:0;background:rgb(255,0,0)'><div style='position:absolute;left:100px;top:0;width:100px;height:200px;background:rgb(0,0,255)'></div></body></html>";
            eprintln!("native image test: loading fixture after app readiness");
            app.get_webview_window("image-test")
                .unwrap()
                .navigate(html.parse().unwrap())
                .unwrap();
        }
    });
    assert_eq!(
        result.lock().unwrap().take(),
        Some(Ok(())),
        "native image export did not complete"
    );
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
fn main() {}
