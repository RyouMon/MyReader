use crate::error::AppError;

pub struct ReaderWindowService;

impl ReaderWindowService {
    pub fn set_traffic_lights_visible<R: tauri::Runtime>(
        window: tauri::Window<R>,
        visible: bool,
        x: i32,
        y: i32,
        reposition: bool,
    ) -> Result<(), AppError> {
        set_traffic_lights_visible(window, visible, x, y, reposition)
    }
}

#[cfg(target_os = "macos")]
fn set_traffic_lights_visible<R: tauri::Runtime>(
    window: tauri::Window<R>,
    visible: bool,
    x: i32,
    y: i32,
    reposition: bool,
) -> Result<(), AppError> {
    use tracing::error;

    let main_thread_window = window.clone();
    window.run_on_main_thread(move || {
        if let Err(e) = crate::utils::macos_window::sync_standard_window_buttons(
            &main_thread_window,
            !visible,
            x.into(),
            y.into(),
            reposition,
        ) {
            error!("Failed to sync macOS reader traffic lights visibility. error: {e}");
        }
    })?;
    Ok(())
}

#[cfg(not(target_os = "macos"))]
fn set_traffic_lights_visible<R: tauri::Runtime>(
    _window: tauri::Window<R>,
    _visible: bool,
    _x: i32,
    _y: i32,
    _reposition: bool,
) -> Result<(), AppError> {
    Ok(())
}
