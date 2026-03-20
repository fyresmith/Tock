use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager, PhysicalPosition, PhysicalSize, Position, Size, WindowEvent};

const WINDOW_STATE_FILE: &str = "window-state.json";
const DEFAULT_WINDOW_WIDTH: u32 = 1200;
const DEFAULT_WINDOW_HEIGHT: u32 = 800;
const MIN_WINDOW_WIDTH: u32 = 900;
const MIN_WINDOW_HEIGHT: u32 = 600;

#[derive(Debug, Clone, Serialize, Deserialize)]
struct SavedWindowState {
    width: u32,
    height: u32,
    x: Option<i32>,
    y: Option<i32>,
    maximized: bool,
}

impl Default for SavedWindowState {
    fn default() -> Self {
        Self {
            width: DEFAULT_WINDOW_WIDTH,
            height: DEFAULT_WINDOW_HEIGHT,
            x: None,
            y: None,
            maximized: false,
        }
    }
}

fn window_state_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(crate::db::app_data_dir(app)?.join(WINDOW_STATE_FILE))
}

fn load_saved_state(app: &AppHandle) -> Result<Option<SavedWindowState>, String> {
    let path = window_state_path(app)?;
    let raw = match fs::read_to_string(path) {
        Ok(raw) => raw,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(error.to_string()),
    };

    let parsed = serde_json::from_str::<SavedWindowState>(&raw).map_err(|error| error.to_string())?;
    Ok(Some(parsed))
}

fn save_state(app: &AppHandle, state: &SavedWindowState) -> Result<(), String> {
    let data_dir = crate::db::app_data_dir(app)?;
    fs::create_dir_all(&data_dir).map_err(|error| error.to_string())?;

    let path = window_state_path(app)?;
    let json = serde_json::to_string_pretty(state).map_err(|error| error.to_string())?;
    fs::write(path, json).map_err(|error| error.to_string())
}

fn capture_window_state(app: &AppHandle) -> Result<SavedWindowState, String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "Main window not found".to_string())?;

    let previous = load_saved_state(app)?.unwrap_or_default();
    let maximized = window.is_maximized().map_err(|error| error.to_string())?;

    if maximized {
        return Ok(SavedWindowState {
            maximized: true,
            ..previous
        });
    }

    let size = window.outer_size().map_err(|error| error.to_string())?;
    let position = window.outer_position().map_err(|error| error.to_string())?;

    Ok(SavedWindowState {
        width: size.width.max(MIN_WINDOW_WIDTH),
        height: size.height.max(MIN_WINDOW_HEIGHT),
        x: Some(position.x),
        y: Some(position.y),
        maximized: false,
    })
}

fn persist_window_state(app: &AppHandle) {
    if let Ok(state) = capture_window_state(app) {
        let _ = save_state(app, &state);
    }
}

fn restore_window_state(app: &AppHandle) {
    let Some(window) = app.get_webview_window("main") else {
        return;
    };

    let Ok(Some(state)) = load_saved_state(app) else {
        return;
    };

    let width = state.width.max(MIN_WINDOW_WIDTH);
    let height = state.height.max(MIN_WINDOW_HEIGHT);
    let _ = window.set_size(Size::from(PhysicalSize::new(width, height)));

    if let (Some(x), Some(y)) = (state.x, state.y) {
        let _ = window.set_position(Position::from(PhysicalPosition::new(x, y)));
    }

    if state.maximized {
        let _ = window.maximize();
    }
}

pub fn setup(app: &mut tauri::App) {
    restore_window_state(app.handle());

    if let Some(window) = app.get_webview_window("main") {
        let app_handle = app.handle().clone();
        window.on_window_event(move |event| match event {
            WindowEvent::Moved(_) | WindowEvent::Resized(_) | WindowEvent::CloseRequested { .. } => {
                persist_window_state(&app_handle);
            }
            _ => {}
        });
    }
}
