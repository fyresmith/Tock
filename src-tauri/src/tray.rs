use std::time::Duration;

use chrono::{Local, NaiveDateTime};
use sqlx::SqlitePool;
use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager,
};

use crate::commands::timer::{discard_timer_impl, start_timer_impl};

pub fn setup_tray(app: &mut tauri::App) -> tauri::Result<()> {
    let menu = build_menu(app.handle(), false)?;

    TrayIconBuilder::with_id("tock-tray")
        .icon(app.default_window_icon().unwrap().clone())
        .tooltip("Tock — Ready")
        .menu(&menu)
        .on_menu_event(|app, event| {
            tauri::async_runtime::spawn(handle_menu_event(app.clone(), event.id().as_ref().to_string()));
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                let app = tray.app_handle();
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
        })
        .build(app)?;

    // Close-to-tray
    let window = app.get_webview_window("main").unwrap();
    let win = window.clone();
    window.on_window_event(move |event| {
        if let tauri::WindowEvent::CloseRequested { api, .. } = event {
            let _ = win.hide();
            api.prevent_close();
        }
    });

    // Background ticker
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

fn build_menu(app: &AppHandle, has_active: bool) -> tauri::Result<Menu<tauri::Wry>> {
    let menu = Menu::new(app)?;

    if has_active {
        let status = MenuItem::with_id(app, "status", "● Recording", false, None::<&str>)?;
        menu.append(&status)?;
        menu.append(&PredefinedMenuItem::separator(app)?)?;
        let stop = MenuItem::with_id(app, "stop", "Stop…", true, None::<&str>)?;
        let discard = MenuItem::with_id(app, "discard", "Discard", true, None::<&str>)?;
        menu.append(&stop)?;
        menu.append(&discard)?;
    } else {
        let status = MenuItem::with_id(app, "status", "○  Tock — Ready", false, None::<&str>)?;
        menu.append(&status)?;
        menu.append(&PredefinedMenuItem::separator(app)?)?;
        let start = MenuItem::with_id(app, "start", "Start Timer", true, None::<&str>)?;
        menu.append(&start)?;
    }

    menu.append(&PredefinedMenuItem::separator(app)?)?;
    let show = MenuItem::with_id(app, "show", "Show Tock", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    menu.append(&show)?;
    menu.append(&quit)?;

    Ok(menu)
}

async fn handle_menu_event(app: AppHandle, id: String) {
    match id.as_str() {
        "start" => {
            let pool = app.state::<SqlitePool>();
            let _ = start_timer_impl(pool.inner(), &app, None).await;
        }
        "stop" => {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
            let _ = app.emit("tray-stop-requested", ());
        }
        "discard" => {
            let pool = app.state::<SqlitePool>();
            // Find active entry id
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
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
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

    let tray = match app.tray_by_id("tock-tray") {
        Some(t) => t,
        None => return,
    };

    if let Some((date, start_time)) = entry {
        let elapsed = compute_elapsed(&date, &start_time);
        let tooltip = format!("Tock — Recording {elapsed}");
        let _ = tray.set_tooltip(Some(&tooltip));
        if let Ok(menu) = build_menu(app, true) {
            let _ = tray.set_menu(Some(menu));
        }
    } else {
        let _ = tray.set_tooltip(Some("Tock — Ready"));
        if let Ok(menu) = build_menu(app, false) {
            let _ = tray.set_menu(Some(menu));
        }
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

