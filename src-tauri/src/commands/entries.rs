use chrono::Local;
use serde::Deserialize;
use sqlx::{QueryBuilder, Sqlite, SqlitePool};
use uuid::Uuid;

use crate::backup;
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
    pub billable: Option<bool>,
    pub hourly_rate: Option<f64>,
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
    pub client_id: Option<String>,
    pub billable: Option<bool>,
    pub hourly_rate: Option<f64>,
}

#[derive(Debug, Deserialize)]
pub struct ListEntriesArgs {
    pub date_from: Option<String>,
    pub date_to: Option<String>,
    pub search: Option<String>,
    pub tag_id: Option<String>,
    pub client_id: Option<String>,
    pub invoiced: Option<bool>,
    pub billable: Option<bool>,
}

fn normalize_optional_client_id(value: Option<String>) -> Option<String> {
    value.and_then(|value| {
        let trimmed = value.trim();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed.to_string())
        }
    })
}

async fn check_overlap(
    pool: &SqlitePool,
    date: &str,
    start_time: &str,
    end_time: &str,
    exclude_id: Option<&str>,
) -> Result<(), String> {
    let row: Option<(String, String)> = if let Some(id) = exclude_id {
        sqlx::query_as(
            "SELECT start_time, end_time FROM time_entries
             WHERE date = ? AND end_time IS NOT NULL
               AND end_time > ? AND start_time < ?
               AND id != ?
             LIMIT 1",
        )
        .bind(date)
        .bind(start_time)
        .bind(end_time)
        .bind(id)
        .fetch_optional(pool)
        .await
        .map_err(|e| e.to_string())?
    } else {
        sqlx::query_as(
            "SELECT start_time, end_time FROM time_entries
             WHERE date = ? AND end_time IS NOT NULL
               AND end_time > ? AND start_time < ?
             LIMIT 1",
        )
        .bind(date)
        .bind(start_time)
        .bind(end_time)
        .fetch_optional(pool)
        .await
        .map_err(|e| e.to_string())?
    };

    if let Some((s, e)) = row {
        return Err(format!(
            "Overlaps with existing entry ({}–{})",
            &s[..5],
            &e[..5]
        ));
    }
    Ok(())
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
    app: tauri::AppHandle,
    args: CreateEntryArgs,
) -> Result<TimeEntry, String> {
    check_overlap(pool.inner(), &args.date, &args.start_time, &args.end_time, None).await?;

    let id = Uuid::new_v4().to_string();
    let now = now_iso();
    let duration = compute_duration(&args.start_time, &args.end_time);
    let tag = get_selectable_tag(pool.inner(), &args.tag_id).await?;
    let billable = args.billable.unwrap_or(true);
    let client_id = normalize_optional_client_id(args.client_id);

    sqlx::query(
        "INSERT INTO time_entries (
            id, date, start_time, end_time, duration_minutes, description, entry_type, tag_id,
            client_id, invoiced, invoice_id, billable, hourly_rate, created_at, updated_at
         )
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NULL, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(&args.date)
    .bind(&args.start_time)
    .bind(&args.end_time)
    .bind(duration)
    .bind(&args.description)
    .bind(&tag.name)
    .bind(&tag.id)
    .bind(&client_id)
    .bind(billable)
    .bind(args.hourly_rate)
    .bind(&now)
    .bind(&now)
    .execute(pool.inner())
    .await
    .map_err(|e| e.to_string())?;

    let entry = fetch_time_entry_by_id(pool.inner(), &id).await?;
    backup::run_auto_backup_if_enabled(pool.inner(), &app, "entry-create").await;
    Ok(entry)
}

#[tauri::command]
pub async fn update_entry(
    pool: tauri::State<'_, SqlitePool>,
    app: tauri::AppHandle,
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
    let client_id = match args.client_id {
        Some(next_client_id) => normalize_optional_client_id(Some(next_client_id)),
        None => current.client_id.clone(),
    };
    let billable = args.billable.unwrap_or(current.billable);
    let hourly_rate = args.hourly_rate;

    if let Some(ref end) = end_time_val {
        check_overlap(pool.inner(), &date, &start_time, end, Some(&args.id)).await?;
    }

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
         SET date = ?, start_time = ?, end_time = ?, duration_minutes = ?, description = ?, entry_type = ?, tag_id = ?, client_id = ?, billable = ?, hourly_rate = ?, updated_at = ?
         WHERE id = ?",
    )
    .bind(&date)
    .bind(&start_time)
    .bind(&end_time_val)
    .bind(duration)
    .bind(&description)
    .bind(&tag.name)
    .bind(&tag.id)
    .bind(&client_id)
    .bind(billable)
    .bind(hourly_rate)
    .bind(&now)
    .bind(&args.id)
    .execute(pool.inner())
    .await
    .map_err(|e| e.to_string())?;

    if let Some(ref invoice_id) = current.invoice_id {
        sync_invoice_totals(pool.inner(), invoice_id).await?;
    }

    let entry = fetch_time_entry_by_id(pool.inner(), &args.id).await?;
    backup::run_auto_backup_if_enabled(pool.inner(), &app, "entry-update").await;
    Ok(entry)
}

#[tauri::command]
pub async fn delete_entry(
    pool: tauri::State<'_, SqlitePool>,
    app: tauri::AppHandle,
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

    backup::run_auto_backup_if_enabled(pool.inner(), &app, "entry-delete").await;
    Ok(())
}

#[tauri::command]
pub async fn bulk_delete_entries(
    pool: tauri::State<'_, SqlitePool>,
    app: tauri::AppHandle,
    ids: Vec<String>,
) -> Result<(), String> {
    let mut invoice_ids_to_sync: Vec<String> = Vec::new();

    for id in &ids {
        let current = fetch_time_entry_by_id(pool.inner(), id).await?;
        if let Some(ref invoice_id) = current.invoice_id {
            ensure_invoice_editable(pool.inner(), invoice_id).await?;
            if !invoice_ids_to_sync.contains(invoice_id) {
                invoice_ids_to_sync.push(invoice_id.clone());
            }
        }
    }

    let mut tx = pool.inner().begin().await.map_err(|e| e.to_string())?;
    for id in &ids {
        sqlx::query("DELETE FROM time_entries WHERE id = ?")
            .bind(id)
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;
    }
    tx.commit().await.map_err(|e| e.to_string())?;

    for invoice_id in &invoice_ids_to_sync {
        let _ = sync_invoice_totals(pool.inner(), invoice_id).await;
    }

    backup::run_auto_backup_if_enabled(pool.inner(), &app, "entry-bulk-delete").await;
    Ok(())
}

#[tauri::command]
pub async fn bulk_update_tag(
    pool: tauri::State<'_, SqlitePool>,
    app: tauri::AppHandle,
    ids: Vec<String>,
    tag_id: String,
) -> Result<(), String> {
    let tag = get_selectable_tag(pool.inner(), &tag_id).await?;
    let now = now_iso();

    let mut editable_ids: Vec<String> = Vec::new();
    for id in &ids {
        let current = fetch_time_entry_by_id(pool.inner(), id).await?;
        if let Some(ref invoice_id) = current.invoice_id {
            if ensure_invoice_editable(pool.inner(), invoice_id).await.is_ok() {
                editable_ids.push(id.clone());
            }
        } else {
            editable_ids.push(id.clone());
        }
    }

    if editable_ids.is_empty() {
        return Ok(());
    }

    let mut tx = pool.inner().begin().await.map_err(|e| e.to_string())?;
    for id in &editable_ids {
        sqlx::query(
            "UPDATE time_entries SET tag_id = ?, entry_type = ?, updated_at = ? WHERE id = ?",
        )
        .bind(&tag.id)
        .bind(&tag.name)
        .bind(&now)
        .bind(id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    }
    tx.commit().await.map_err(|e| e.to_string())?;

    backup::run_auto_backup_if_enabled(pool.inner(), &app, "entry-bulk-update-tag").await;
    Ok(())
}

#[tauri::command]
pub async fn bulk_update_client(
    pool: tauri::State<'_, SqlitePool>,
    app: tauri::AppHandle,
    ids: Vec<String>,
    client_id: String,
) -> Result<(), String> {
    let now = now_iso();
    let normalized_client_id = normalize_optional_client_id(Some(client_id));

    let mut editable_ids: Vec<String> = Vec::new();
    for id in &ids {
        let current = fetch_time_entry_by_id(pool.inner(), id).await?;
        if let Some(ref invoice_id) = current.invoice_id {
            if ensure_invoice_editable(pool.inner(), invoice_id).await.is_ok() {
                editable_ids.push(id.clone());
            }
        } else {
            editable_ids.push(id.clone());
        }
    }

    if editable_ids.is_empty() {
        return Ok(());
    }

    let mut tx = pool.inner().begin().await.map_err(|e| e.to_string())?;
    for id in &editable_ids {
        sqlx::query("UPDATE time_entries SET client_id = ?, updated_at = ? WHERE id = ?")
            .bind(&normalized_client_id)
            .bind(&now)
            .bind(id)
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;
    }
    tx.commit().await.map_err(|e| e.to_string())?;

    backup::run_auto_backup_if_enabled(pool.inner(), &app, "entry-bulk-update-client").await;
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
    if let Some(ref client_id) = args.client_id {
        if client_id.trim().is_empty() {
            query.push(" AND time_entries.client_id IS NULL");
        } else {
            query.push(" AND time_entries.client_id = ");
            query.push_bind(client_id.clone());
        }
    }
    if let Some(invoiced) = args.invoiced {
        query.push(" AND time_entries.invoiced = ");
        query.push_bind(if invoiced { 1 } else { 0 });
    }
    if let Some(billable) = args.billable {
        query.push(" AND time_entries.billable = ");
        query.push_bind(if billable { 1_i64 } else { 0_i64 });
    }

    query.push(" ORDER BY time_entries.date DESC, time_entries.start_time DESC");

    query
        .build_query_as::<TimeEntry>()
        .fetch_all(pool.inner())
        .await
        .map_err(|e| e.to_string())
}
