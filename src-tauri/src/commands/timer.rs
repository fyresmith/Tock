use chrono::Local;
use chrono::NaiveTime;
use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use tauri::{Emitter, Manager, WebviewUrl, WebviewWindowBuilder};
use uuid::Uuid;

use crate::backup;
use crate::commands::tags::{get_default_active_tag, get_selectable_tag};

pub const TIME_ENTRY_SELECT: &str = "
    time_entries.id,
    time_entries.date,
    time_entries.start_time,
    time_entries.end_time,
    time_entries.duration_minutes,
    time_entries.description,
    time_entries.entry_type,
    time_entries.tag_id,
    COALESCE(entry_tags.name, time_entries.entry_type) AS tag_name,
    COALESCE(entry_tags.color, '#64748b') AS tag_color,
    time_entries.invoiced,
    time_entries.invoice_id,
    time_entries.client_id,
    time_entries.created_at,
    time_entries.updated_at,
    COALESCE(time_entries.billable, 1) AS billable,
    time_entries.hourly_rate
";

#[derive(Debug, Serialize, Deserialize, Clone, sqlx::FromRow)]
pub struct TimeEntry {
    pub id: String,
    pub date: String,
    pub start_time: String,
    pub end_time: Option<String>,
    pub duration_minutes: Option<i64>,
    pub description: String,
    pub entry_type: String,
    pub tag_id: Option<String>,
    pub tag_name: String,
    pub tag_color: String,
    pub invoiced: bool,
    pub invoice_id: Option<String>,
    pub client_id: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub billable: bool,
    pub hourly_rate: Option<f64>,
}

fn now_date() -> String {
    Local::now().format("%Y-%m-%d").to_string()
}

fn now_time() -> String {
    Local::now().format("%H:%M:%S").to_string()
}

fn now_iso() -> String {
    Local::now().format("%Y-%m-%dT%H:%M:%S").to_string()
}

pub fn compute_duration(start: &str, end: &str) -> i64 {
    let parse = |s: &str| NaiveTime::parse_from_str(s, "%H:%M:%S").ok();
    if let (Some(s), Some(e)) = (parse(start), parse(end)) {
        let diff = e.signed_duration_since(s);
        (diff.num_seconds() / 60).max(0)
    } else {
        0
    }
}

fn base_time_entry_query(where_clause: &str) -> String {
    format!(
        "SELECT {}
         FROM time_entries
         LEFT JOIN entry_tags ON time_entries.tag_id = entry_tags.id
         {}",
        TIME_ENTRY_SELECT, where_clause
    )
}

pub async fn fetch_time_entry_by_id(pool: &SqlitePool, entry_id: &str) -> Result<TimeEntry, String> {
    sqlx::query_as(&base_time_entry_query("WHERE time_entries.id = ?"))
        .bind(entry_id)
        .fetch_one(pool)
        .await
        .map_err(|e| e.to_string())
}

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
struct ActiveTimerSeed {
    id: String,
    tag_id: Option<String>,
}

#[tauri::command]
pub async fn start_timer(
    pool: tauri::State<'_, SqlitePool>,
    app: tauri::AppHandle,
    client_id: Option<String>,
) -> Result<TimeEntry, String> {
    if let Some(existing) = sqlx::query_as::<_, ActiveTimerSeed>(
        "SELECT id, tag_id FROM time_entries WHERE end_time IS NULL ORDER BY created_at DESC LIMIT 1",
    )
    .fetch_optional(pool.inner())
    .await
    .map_err(|e| e.to_string())?
    {
        return fetch_time_entry_by_id(pool.inner(), &existing.id).await;
    }

    let default_tag = get_default_active_tag(pool.inner()).await?;
    let id = Uuid::new_v4().to_string();
    let date = now_date();
    let start_time = now_time();
    let now = now_iso();

    sqlx::query(
        "INSERT INTO time_entries (id, date, start_time, end_time, duration_minutes, description, entry_type, tag_id, client_id, invoiced, invoice_id, created_at, updated_at)
         VALUES (?, ?, ?, NULL, NULL, '', ?, ?, ?, 0, NULL, ?, ?)",
    )
    .bind(&id)
    .bind(&date)
    .bind(&start_time)
    .bind(&default_tag.name)
    .bind(&default_tag.id)
    .bind(&client_id)
    .bind(&now)
    .bind(&now)
    .execute(pool.inner())
    .await
    .map_err(|e| e.to_string())?;

    let entry = TimeEntry {
        id,
        date,
        start_time,
        end_time: None,
        duration_minutes: None,
        description: String::new(),
        entry_type: default_tag.name.clone(),
        tag_id: Some(default_tag.id),
        tag_name: default_tag.name,
        tag_color: default_tag.color,
        invoiced: false,
        invoice_id: None,
        client_id,
        created_at: now.clone(),
        updated_at: now,
        billable: true,
        hourly_rate: None,
    };
    backup::run_auto_backup_if_enabled(pool.inner(), &app, "timer-start").await;
    let _ = app.emit("timer-changed", ());
    Ok(entry)
}

#[tauri::command]
pub async fn stop_timer(
    pool: tauri::State<'_, SqlitePool>,
    app: tauri::AppHandle,
    entry_id: String,
    description: String,
    tag_id: String,
) -> Result<TimeEntry, String> {
    let end_time = now_time();
    let now = now_iso();

    let (_date, start_time): (String, String) =
        sqlx::query_as("SELECT date, start_time FROM time_entries WHERE id = ?")
            .bind(&entry_id)
            .fetch_one(pool.inner())
            .await
            .map_err(|e| e.to_string())?;

    let tag = get_selectable_tag(pool.inner(), &tag_id).await?;
    let duration = compute_duration(&start_time, &end_time);

    sqlx::query(
        "UPDATE time_entries
         SET end_time = ?, duration_minutes = ?, description = ?, entry_type = ?, tag_id = ?, updated_at = ?
         WHERE id = ?",
    )
    .bind(&end_time)
    .bind(duration)
    .bind(&description)
    .bind(&tag.name)
    .bind(&tag.id)
    .bind(&now)
    .bind(&entry_id)
    .execute(pool.inner())
    .await
    .map_err(|e| e.to_string())?;

    backup::run_auto_backup_if_enabled(pool.inner(), &app, "timer-stop").await;
    let _ = app.emit("timer-changed", ());
    fetch_time_entry_by_id(pool.inner(), &entry_id).await
}

#[tauri::command]
pub async fn get_active_timer(
    pool: tauri::State<'_, SqlitePool>,
) -> Result<Option<TimeEntry>, String> {
    let entry: Option<TimeEntry> = sqlx::query_as(&base_time_entry_query(
        "WHERE time_entries.end_time IS NULL ORDER BY time_entries.created_at DESC LIMIT 1",
    ))
    .fetch_optional(pool.inner())
    .await
    .map_err(|e| e.to_string())?;

    Ok(entry)
}

#[tauri::command]
pub async fn discard_timer(
    pool: tauri::State<'_, SqlitePool>,
    app: tauri::AppHandle,
    entry_id: String,
) -> Result<(), String> {
    sqlx::query("DELETE FROM time_entries WHERE id = ? AND end_time IS NULL")
        .bind(&entry_id)
        .execute(pool.inner())
        .await
        .map_err(|e| e.to_string())?;
    backup::run_auto_backup_if_enabled(pool.inner(), &app, "timer-discard").await;
    let _ = app.emit("timer-changed", ());
    Ok(())
}

#[tauri::command]
pub async fn open_timer_popup(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(w) = app.get_webview_window("timer-popup") {
        let _ = w.show();
        let _ = w.set_focus();
        return Ok(());
    }
    WebviewWindowBuilder::new(&app, "timer-popup", WebviewUrl::App("index.html".into()))
        .title("Timer")
        .inner_size(280.0, 280.0)
        .resizable(false)
        .always_on_top(true)
        .build()
        .map_err(|e| e.to_string())?;
    Ok(())
}
