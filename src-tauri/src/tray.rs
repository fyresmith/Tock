use std::time::Duration;

use chrono::{Local, NaiveDateTime};
use sqlx::SqlitePool;
use tauri::{
    image::Image,
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, Wry,
};

use crate::commands::timer::{discard_timer_impl, start_timer_impl};

const TRAY_ID: &str = "tock-tray";

struct TrayMenuState {
    _menu: Menu<Wry>,
    status: MenuItem<Wry>,
    start: MenuItem<Wry>,
    stop: MenuItem<Wry>,
    discard: MenuItem<Wry>,
}

pub fn setup_tray(app: &mut tauri::App) -> tauri::Result<()> {
    let menu_state = build_menu(app.handle())?;

    let tray_icon = Image::from_bytes(include_bytes!("../icons/tray-icon.png"))
        .expect("tray icon missing");

    TrayIconBuilder::with_id(TRAY_ID)
        .icon(tray_icon)
        .icon_as_template(cfg!(target_os = "macos"))
        .tooltip("Tock")
        .title("")
        .show_menu_on_left_click(false)
        .menu(&menu_state._menu)
        .on_menu_event(|app, event| {
            tauri::async_runtime::spawn(handle_menu_event(
                app.clone(),
                event.id().as_ref().to_string(),
            ));
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_main_window(tray.app_handle());
            }
        })
        .build(app)?;

    app.manage(menu_state);

    if let Some(window) = app.get_webview_window("main") {
        let app_handle = app.handle().clone();
        window.on_window_event(move |event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                hide_main_window(&app_handle);
                api.prevent_close();
            }
        });
    }

    tauri::async_runtime::block_on(update_tray(app.handle()));

    let handle = app.handle().clone();
    tauri::async_runtime::spawn(async move {
        let mut interval = tokio::time::interval(Duration::from_secs(1));
        loop {
            interval.tick().await;
            update_tray(&handle).await;
        }
    });

    Ok(())
}

fn build_menu(app: &AppHandle) -> tauri::Result<TrayMenuState> {
    let menu = Menu::new(app)?;
    let status = MenuItem::with_id(app, "status", "○ Tock — Ready", false, None::<&str>)?;
    let start = MenuItem::with_id(app, "start", "Start Timer", true, None::<&str>)?;
    let stop = MenuItem::with_id(app, "stop", "Stop…", false, None::<&str>)?;
    let discard = MenuItem::with_id(app, "discard", "Discard", false, None::<&str>)?;
    let show = MenuItem::with_id(app, "show", "Show Tock", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;

    menu.append(&status)?;
    menu.append(&PredefinedMenuItem::separator(app)?)?;
    menu.append(&start)?;
    menu.append(&stop)?;
    menu.append(&discard)?;
    menu.append(&PredefinedMenuItem::separator(app)?)?;
    menu.append(&show)?;
    menu.append(&quit)?;

    Ok(TrayMenuState {
        _menu: menu,
        status,
        start,
        stop,
        discard,
    })
}

async fn handle_menu_event(app: AppHandle, id: String) {
    match id.as_str() {
        "start" => {
            let pool = app.state::<SqlitePool>();
            let _ = start_timer_impl(pool.inner(), &app, None).await;
        }
        "stop" => {
            show_main_window(&app);
            let _ = app.emit("tray-stop-requested", ());
        }
        "discard" => {
            let pool = app.state::<SqlitePool>();
            let result: Option<(String,)> = sqlx::query_as(
                "SELECT id FROM time_entries WHERE end_time IS NULL ORDER BY created_at DESC LIMIT 1",
            )
            .fetch_optional(pool.inner())
            .await
            .ok()
            .flatten();

            if let Some((entry_id,)) = result {
                let _ = discard_timer_impl(pool.inner(), &app, entry_id).await;
            }
        }
        "show" => {
            show_main_window(&app);
        }
        "quit" => {
            app.exit(0);
        }
        _ => {}
    }
}

pub async fn update_tray(app: &AppHandle) {
    let pool = match app.try_state::<SqlitePool>() {
        Some(p) => p,
        None => return,
    };

    let entry: Option<(String, String)> = sqlx::query_as(
        "SELECT date, start_time FROM time_entries WHERE end_time IS NULL ORDER BY created_at DESC LIMIT 1",
    )
    .fetch_optional(pool.inner())
    .await
    .ok()
    .flatten();

    let tray = match app.tray_by_id(TRAY_ID) {
        Some(t) => t,
        None => return,
    };

    if let Some((date, start_time)) = entry {
        let elapsed = compute_elapsed(&date, &start_time);
        let tooltip = format!("Tock — Recording {elapsed}");
        let _ = tray.set_title(Some(elapsed.as_str()));
        let _ = tray.set_tooltip(Some(tooltip.as_str()));
        sync_menu_state(app, &format!("● Recording {elapsed}"), true);
    } else {
        let _ = tray.set_title(Some(""));
        let _ = tray.set_tooltip(Some("Tock — Ready"));
        sync_menu_state(app, "○ Tock — Ready", false);
    }
}

fn sync_menu_state(app: &AppHandle, status_text: &str, has_active: bool) {
    if let Some(state) = app.try_state::<TrayMenuState>() {
        let _ = state.status.set_text(status_text);
        let _ = state.start.set_enabled(!has_active);
        let _ = state.stop.set_enabled(has_active);
        let _ = state.discard.set_enabled(has_active);
    }
}

pub fn show_main_window(app: &AppHandle) {
    #[cfg(target_os = "macos")]
    let _ = app.show();

    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

fn hide_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.hide();
    }
}

fn compute_elapsed(date: &str, start_time: &str) -> String {
    let start_str = format!("{date} {start_time}");
    let Ok(start) = NaiveDateTime::parse_from_str(&start_str, "%Y-%m-%d %H:%M:%S") else {
        return "0:00:00".to_string();
    };
    let elapsed = Local::now().naive_local() - start;
    let secs = elapsed.num_seconds().max(0);
    let h = secs / 3600;
    let m = (secs % 3600) / 60;
    let s = secs % 60;
    format!("{h}:{m:02}:{s:02}")
}
