use chrono::Local;
use serde::Deserialize;
use sqlx::{QueryBuilder, Sqlite, SqlitePool};
use uuid::Uuid;

use crate::commands::invoices::{ensure_invoice_editable, sync_invoice_totals};
use crate::commands::tags::{get_default_active_tag, get_selectable_tag, get_tag_by_id};
use crate::commands::timer::{compute_duration, fetch_time_entry_by_id, TimeEntry, TIME_ENTRY_SELECT};

fn now_iso() -> String {
    Local::now().format("%Y-%m-%dT%H:%M:%S").to_string()
}

#[derive(Debug, Deserialize)]
pub struct CreateEntryArgs {
    pub date: String,
    pub start_time: String,
    pub end_time: String,
    pub description: String,
    pub tag_id: String,
    pub client_id: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateEntryArgs {
    pub id: String,
    pub date: Option<String>,
    pub start_time: Option<String>,
    pub end_time: Option<String>,
    pub duration_minutes: Option<i64>,
    pub description: Option<String>,
    pub tag_id: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct ListEntriesArgs {
    pub date_from: Option<String>,
    pub date_to: Option<String>,
    pub search: Option<String>,
    pub tag_id: Option<String>,
    pub invoiced: Option<bool>,
}

fn list_query_base() -> QueryBuilder<'static, Sqlite> {
    QueryBuilder::new(format!(
        "SELECT {}
         FROM time_entries
         LEFT JOIN entry_tags ON time_entries.tag_id = entry_tags.id
         WHERE time_entries.end_time IS NOT NULL",
        TIME_ENTRY_SELECT
    ))
}

#[tauri::command]
pub async fn create_entry(
    pool: tauri::State<'_, SqlitePool>,
    args: CreateEntryArgs,
) -> Result<TimeEntry, String> {
    let id = Uuid::new_v4().to_string();
    let now = now_iso();
    let duration = compute_duration(&args.start_time, &args.end_time);
    let tag = get_selectable_tag(pool.inner(), &args.tag_id).await?;

    sqlx::query(
        "INSERT INTO time_entries (
            id, date, start_time, end_time, duration_minutes, description, entry_type, tag_id,
            client_id, invoiced, invoice_id, created_at, updated_at
         )
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NULL, ?, ?)",
    )
    .bind(&id)
    .bind(&args.date)
    .bind(&args.start_time)
    .bind(&args.end_time)
    .bind(duration)
    .bind(&args.description)
    .bind(&tag.name)
    .bind(&tag.id)
    .bind(&args.client_id)
    .bind(&now)
    .bind(&now)
    .execute(pool.inner())
    .await
    .map_err(|e| e.to_string())?;

    fetch_time_entry_by_id(pool.inner(), &id).await
}

#[tauri::command]
pub async fn update_entry(
    pool: tauri::State<'_, SqlitePool>,
    args: UpdateEntryArgs,
) -> Result<TimeEntry, String> {
    let now = now_iso();
    let current = fetch_time_entry_by_id(pool.inner(), &args.id).await?;

    if let Some(ref invoice_id) = current.invoice_id {
        ensure_invoice_editable(pool.inner(), invoice_id).await?;
    }

    let date = args.date.unwrap_or(current.date.clone());
    let start_time = args.start_time.unwrap_or(current.start_time.clone());
    let end_time_val = args.end_time.or(current.end_time.clone());
    let description = args.description.unwrap_or(current.description.clone());

    let tag = if let Some(ref next_tag_id) = args.tag_id {
        if current.tag_id.as_deref() == Some(next_tag_id.as_str()) {
            get_tag_by_id(pool.inner(), next_tag_id).await?
        } else {
            get_selectable_tag(pool.inner(), next_tag_id).await?
        }
    } else if let Some(ref current_tag_id) = current.tag_id {
        get_tag_by_id(pool.inner(), current_tag_id).await?
    } else {
        get_default_active_tag(pool.inner()).await?
    };

    let duration = match (&end_time_val, &args.duration_minutes) {
        (_, Some(d)) => *d,
        (Some(e), None) => compute_duration(&start_time, e),
        (None, None) => current.duration_minutes.unwrap_or(0),
    };

    sqlx::query(
        "UPDATE time_entries
         SET date = ?, start_time = ?, end_time = ?, duration_minutes = ?, description = ?, entry_type = ?, tag_id = ?, updated_at = ?
         WHERE id = ?",
    )
    .bind(&date)
    .bind(&start_time)
    .bind(&end_time_val)
    .bind(duration)
    .bind(&description)
    .bind(&tag.name)
    .bind(&tag.id)
    .bind(&now)
    .bind(&args.id)
    .execute(pool.inner())
    .await
    .map_err(|e| e.to_string())?;

    if let Some(ref invoice_id) = current.invoice_id {
        sync_invoice_totals(pool.inner(), invoice_id).await?;
    }

    fetch_time_entry_by_id(pool.inner(), &args.id).await
}

#[tauri::command]
pub async fn delete_entry(
    pool: tauri::State<'_, SqlitePool>,
    id: String,
) -> Result<(), String> {
    let current = fetch_time_entry_by_id(pool.inner(), &id).await?;
    if let Some(ref invoice_id) = current.invoice_id {
        ensure_invoice_editable(pool.inner(), invoice_id).await?;
    }

    sqlx::query("DELETE FROM time_entries WHERE id = ?")
        .bind(&id)
        .execute(pool.inner())
        .await
        .map_err(|e| e.to_string())?;

    if let Some(ref invoice_id) = current.invoice_id {
        sync_invoice_totals(pool.inner(), invoice_id).await?;
    }

    Ok(())
}

#[tauri::command]
pub async fn list_entries(
    pool: tauri::State<'_, SqlitePool>,
    args: ListEntriesArgs,
) -> Result<Vec<TimeEntry>, String> {
    let mut query = list_query_base();

    if let Some(ref from) = args.date_from {
        query.push(" AND time_entries.date >= ");
        query.push_bind(from.clone());
    }
    if let Some(ref to) = args.date_to {
        query.push(" AND time_entries.date <= ");
        query.push_bind(to.clone());
    }
    if let Some(ref search) = args.search {
        query.push(" AND time_entries.description LIKE ");
        query.push_bind(format!("%{}%", search));
    }
    if let Some(ref tag_id) = args.tag_id {
        query.push(" AND time_entries.tag_id = ");
        query.push_bind(tag_id.clone());
    }
    if let Some(invoiced) = args.invoiced {
        query.push(" AND time_entries.invoiced = ");
        query.push_bind(if invoiced { 1 } else { 0 });
    }

    query.push(" ORDER BY time_entries.date DESC, time_entries.start_time DESC");

    query
        .build_query_as::<TimeEntry>()
        .fetch_all(pool.inner())
        .await
        .map_err(|e| e.to_string())
}
