use objc2_app_kit::{NSView, NSWindow, NSWindowButton};

use crate::error::AppError;

pub fn sync_standard_window_buttons<R: tauri::Runtime>(
    window: &tauri::Window<R>,
    hidden: bool,
    x: f64,
    y: f64,
    reposition: bool,
) -> Result<(), AppError> {
    let ns_window = window.ns_window()?;
    if ns_window.is_null() {
        return Err(AppError::Config("MACOS_NS_WINDOW_UNAVAILABLE".into()));
    }

    let ns_window = unsafe { &*(ns_window.cast::<NSWindow>()) };
    let close = ns_window
        .standardWindowButton(NSWindowButton::CloseButton)
        .ok_or_else(|| AppError::Config("MACOS_CLOSE_BUTTON_UNAVAILABLE".into()))?;
    let miniaturize = ns_window
        .standardWindowButton(NSWindowButton::MiniaturizeButton)
        .ok_or_else(|| AppError::Config("MACOS_MINIMIZE_BUTTON_UNAVAILABLE".into()))?;
    let zoom = ns_window.standardWindowButton(NSWindowButton::ZoomButton);

    let title_bar_container_view = unsafe { close.superview() }
        .and_then(|view| unsafe { view.superview() })
        .ok_or_else(|| AppError::Config("MACOS_TITLE_BAR_CONTAINER_UNAVAILABLE".into()))?;

    let buttons = [Some(close), Some(miniaturize), zoom];
    for button in buttons.iter().flatten() {
        button.setHidden(hidden);
    }

    if !reposition {
        return Ok(());
    }

    let close = buttons[0]
        .as_ref()
        .ok_or_else(|| AppError::Config("MACOS_CLOSE_BUTTON_UNAVAILABLE".into()))?;
    let miniaturize = buttons[1]
        .as_ref()
        .ok_or_else(|| AppError::Config("MACOS_MINIMIZE_BUTTON_UNAVAILABLE".into()))?;

    let close_rect = NSView::frame(close);
    let title_bar_frame_height = close_rect.size.height + y;
    let mut title_bar_rect = NSView::frame(&title_bar_container_view);
    title_bar_rect.size.height = title_bar_frame_height;
    title_bar_rect.origin.y = ns_window.frame().size.height - title_bar_frame_height;
    title_bar_container_view.setFrame(title_bar_rect);

    let space_between = NSView::frame(miniaturize).origin.x - close_rect.origin.x;
    for (index, button) in buttons.iter().flatten().enumerate() {
        let mut rect = NSView::frame(&button);
        rect.origin.x = x + (index as f64 * space_between);
        button.setFrameOrigin(rect.origin);
    }

    Ok(())
}
