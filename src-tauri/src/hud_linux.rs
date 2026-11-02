//! The agent HUD on Linux: always on top, never focused, not in the taskbar.
//!
//! - Wayland compositors with wlr-layer-shell (KDE Plasma, Sway, Hyprland…):
//!   an overlay-layer surface anchored top-right with no keyboard focus, like
//!   the recording pill. Disabled with `AMBIENT_NO_GTK_LAYER_SHELL=1`.
//! - X11, and Wayland without layer shell (GNOME): an ordinary window hinted
//!   as a utility that doesn't accept focus, kept above and out of the
//!   taskbar and pager. GNOME on Wayland may still place it and raise it as
//!   it likes; X11 honours every hint.

use std::sync::atomic::{AtomicBool, Ordering};

use gtk::prelude::{GtkWindowExt, WidgetExt};
use gtk_layer_shell::{Edge, KeyboardMode, Layer, LayerShell};

static LAYER_SHELL: AtomicBool = AtomicBool::new(false);

/// Set up the freshly built (still hidden) HUD window. Main thread only.
pub fn configure(window: &tauri::WebviewWindow) {
    let Ok(gtk_window) = window.gtk_window() else {
        return;
    };
    gtk_window.set_accept_focus(false);
    gtk_window.set_focus_on_map(false);
    gtk_window.set_skip_taskbar_hint(true);
    gtk_window.set_skip_pager_hint(true);
    gtk_window.set_keep_above(true);
    gtk_window.set_type_hint(gtk::gdk::WindowTypeHint::Utility);

    if crate::utils::env_flag_enabled("AMBIENT_NO_GTK_LAYER_SHELL")
        || !gtk_layer_shell::is_supported()
    {
        return;
    }
    gtk_window.init_layer_shell();
    gtk_window.set_layer(Layer::Overlay);
    gtk_window.set_keyboard_mode(KeyboardMode::None);
    gtk_window.set_exclusive_zone(0);
    gtk_window.set_namespace(concat!(env!("BRAND_SLUG"), "-hud"));
    gtk_window.set_anchor(Edge::Top, true);
    gtk_window.set_anchor(Edge::Right, true);
    gtk_window.set_anchor(Edge::Bottom, false);
    gtk_window.set_anchor(Edge::Left, false);
    LAYER_SHELL.store(gtk_window.is_layer_window(), Ordering::SeqCst);
}

/// Size and place a layer-shell HUD (logical pixels from the top and right
/// edges of the output). False when the HUD isn't a layer surface, so the
/// caller sizes and positions it like any window.
pub fn place(window: &tauri::WebviewWindow, width: f64, height: f64, top: f64, right: f64) -> bool {
    if !LAYER_SHELL.load(Ordering::SeqCst) {
        return false;
    }
    let Ok(gtk_window) = window.gtk_window() else {
        return false;
    };
    gtk_window.set_layer_shell_margin(Edge::Top, top.round() as i32);
    gtk_window.set_layer_shell_margin(Edge::Right, right.round() as i32);
    // Layer surfaces take their size from the size request.
    gtk_window.set_size_request(
        width.round().max(1.0) as i32,
        height.round().max(1.0) as i32,
    );
    gtk_window.resize(1, 1);
    true
}

/// Whether the left or right mouse button is down, for click-outside. Only
/// X11 lets a client see the pointer outside its own windows.
pub fn mouse_down() -> bool {
    crate::context::linux::x11::buttons_down()
}
