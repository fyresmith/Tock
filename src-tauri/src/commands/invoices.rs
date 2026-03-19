use chrono::Local;
use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use std::{collections::HashSet, fs, path::Path};
use uuid::Uuid;

use crate::backup;
use crate::commands::clients::resolve_hourly_rate;
use crate::commands::timer::{TimeEntry, TIME_ENTRY_SELECT};

const LIVE_ENTRY_ORDER: &str = " ORDER BY time_entries.date ASC, time_entries.start_time ASC";

#[derive(Debug, Serialize, Deserialize, Clone, sqlx::FromRow)]
pub struct Invoice {
    pub id: String,
    pub invoice_number: String,
    pub period_start: String,
    pub period_end: String,
    pub total_hours: f64,
    pub hourly_rate: f64,
    pub total_amount: f64,
    pub status: String,
    pub pdf_path: Option<String>,
    pub created_at: String,
    pub issued_at: Option<String>,
    pub sent_at: Option<String>,
    pub due_at: Option<String>,
    pub paid_at: Option<String>,
    pub locked_at: Option<String>,
    pub format: String,
    pub layout_data: Option<String>,
    pub name: Option<String>,
    pub client_id: Option<String>,
    pub client_name: Option<String>,
    pub is_overdue: bool,
    pub is_locked: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct InvoicePreview {
    pub invoice_number: Option<String>,
    pub period_start: String,
    pub period_end: String,
    pub total_hours: f64,
    pub hourly_rate: f64,
    pub total_amount: f64,
    pub format: String,
    pub layout_data: Option<String>,
    pub name: Option<String>,
    pub client_id: Option<String>,
    pub client_name: Option<String>,
    pub issued_at: String,
    pub entries: Vec<TimeEntry>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct InvoiceWithEntries {
    pub invoice: Invoice,
    pub entries: Vec<TimeEntry>,
}

fn now_iso() -> String {
    Local::now().format("%Y-%m-%dT%H:%M:%S").to_string()
}

fn apply_rounding(minutes: i64, rounding: &str) -> i64 {
    match rounding {
        "15" => ((minutes + 14) / 15) * 15,
        "30" => ((minutes + 29) / 30) * 30,
        "60" => ((minutes + 59) / 60) * 60,
        _ => minutes,
    }
}

fn resolve_entry_rate(entry_rate: Option<f64>, default_rate: f64) -> f64 {
    entry_rate.unwrap_or(default_rate)
}

fn invoice_totals(entries: &[TimeEntry], default_rate: f64, rounding: &str) -> (f64, f64) {
    let total_amount: f64 = entries
        .iter()
        .filter(|e| e.billable)
        .map(|e| {
            let mins = e.duration_minutes.unwrap_or(0);
            let rounded_mins = apply_rounding(mins, rounding);
            let rate = resolve_entry_rate(e.hourly_rate, default_rate);
            (rounded_mins as f64 / 60.0) * rate
        })
        .sum();
    let total_amount = (total_amount * 100.0).round() / 100.0;
    let total_hours: f64 = entries
        .iter()
        .filter(|e| e.billable)
        .filter_map(|e| e.duration_minutes)
        .map(|m| apply_rounding(m, rounding) as f64 / 60.0)
        .sum();
    (total_hours, total_amount)
}

async fn get_time_rounding(pool: &SqlitePool) -> String {
    sqlx::query_as::<_, (String,)>("SELECT value FROM settings WHERE key = 'time_rounding'")
        .fetch_optional(pool)
        .await
        .ok()
        .flatten()
        .map(|(v,)| v)
        .unwrap_or_else(|| "none".to_string())
}

fn empty_entries_error() -> String {
    "No completed uninvoiced entries found in the selected period".into()
}

fn invoice_select_query(where_clause: &str) -> String {
    format!(
        "SELECT
            invoices.id,
            invoices.invoice_number,
            invoices.period_start,
            invoices.period_end,
            invoices.total_hours,
            invoices.hourly_rate,
            invoices.total_amount,
            invoices.status,
            invoices.pdf_path,
            invoices.created_at,
            invoices.issued_at,
            invoices.sent_at,
            invoices.due_at,
            invoices.paid_at,
            invoices.locked_at,
            invoices.format,
            invoices.layout_data,
            invoices.name,
            invoices.client_id,
            invoices.client_name,
            CASE
                WHEN invoices.status IN ('issued', 'sent')
                 AND invoices.paid_at IS NULL
                 AND invoices.due_at IS NOT NULL
                 AND invoices.due_at < DATE('now', 'localtime')
                THEN 1 ELSE 0
            END AS is_overdue,
            CASE
                WHEN invoices.locked_at IS NOT NULL OR invoices.status IN ('sent', 'paid')
                THEN 1 ELSE 0
            END AS is_locked
         FROM invoices
         {}",
        where_clause
    )
}

fn live_entry_query(where_clause: &str) -> String {
    format!(
        "SELECT {}
         FROM time_entries
         LEFT JOIN entry_tags ON time_entries.tag_id = entry_tags.id
         {}",
        TIME_ENTRY_SELECT, where_clause
    )
}

async fn fetch_invoice_by_id(pool: &SqlitePool, invoice_id: &str) -> Result<Invoice, String> {
    sqlx::query_as(&invoice_select_query("WHERE invoices.id = ?"))
        .bind(invoice_id)
        .fetch_one(pool)
        .await
        .map_err(|e| e.to_string())
}

async fn fetch_preview_entries(
    pool: &SqlitePool,
    period_start: &str,
    period_end: &str,
    client_id: Option<&str>,
) -> Result<Vec<TimeEntry>, String> {
    if let Some(cid) = client_id {
        sqlx::query_as(&format!(
            "{}{}",
            live_entry_query(
                "WHERE time_entries.date >= ?
                   AND time_entries.date <= ?
                   AND time_entries.end_time IS NOT NULL
                   AND time_entries.invoiced = 0
                   AND time_entries.client_id = ?"
            ),
            LIVE_ENTRY_ORDER
        ))
        .bind(period_start)
        .bind(period_end)
        .bind(cid)
        .fetch_all(pool)
        .await
        .map_err(|e| e.to_string())
    } else {
        sqlx::query_as(&format!(
            "{}{}",
            live_entry_query(
                "WHERE time_entries.date >= ?
                   AND time_entries.date <= ?
                   AND time_entries.end_time IS NOT NULL
                   AND time_entries.invoiced = 0"
            ),
            LIVE_ENTRY_ORDER
        ))
        .bind(period_start)
        .bind(period_end)
        .fetch_all(pool)
        .await
        .map_err(|e| e.to_string())
    }
}

async fn fetch_invoice_live_entries(
    pool: &SqlitePool,
    invoice_id: &str,
) -> Result<Vec<TimeEntry>, String> {
    sqlx::query_as(&format!(
        "{}{}",
        live_entry_query("WHERE time_entries.invoice_id = ?"),
        LIVE_ENTRY_ORDER
    ))
    .bind(invoice_id)
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())
}

async fn fetch_invoice_snapshot_entries(
    pool: &SqlitePool,
    invoice_id: &str,
) -> Result<Vec<TimeEntry>, String> {
    sqlx::query_as(
        "SELECT
            COALESCE(entry_id, id) AS id,
            date,
            start_time,
            end_time,
            COALESCE(billed_minutes, duration_minutes) AS duration_minutes,
            description,
            tag_name AS entry_type,
            tag_id,
            tag_name,
            tag_color,
            1 AS invoiced,
            invoice_id,
            NULL AS client_id,
            created_at,
            created_at AS updated_at,
            COALESCE(billable, 1) AS billable,
            hourly_rate
         FROM invoice_entry_snapshots
         WHERE invoice_id = ?
         ORDER BY date ASC, start_time ASC, created_at ASC",
    )
    .bind(invoice_id)
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())
}

async fn preview_invoice_internal(
    pool: &SqlitePool,
    period_start: String,
    period_end: String,
    format: String,
    layout_data: Option<String>,
    name: Option<String>,
    client_id: Option<String>,
) -> Result<InvoicePreview, String> {
    let hourly_rate = resolve_hourly_rate(pool, client_id.as_deref()).await?;
    let rounding = get_time_rounding(pool).await;
    let entries =
        fetch_preview_entries(pool, &period_start, &period_end, client_id.as_deref()).await?;

    if entries.is_empty() {
        return Err(empty_entries_error());
    }

    let (total_hours, total_amount) = invoice_totals(&entries, hourly_rate, &rounding);

    // Fetch client name for the preview if a client is specified.
    let client_name: Option<String> = if let Some(ref cid) = client_id {
        sqlx::query_as::<_, (String,)>("SELECT name FROM clients WHERE id = ?")
            .bind(cid)
            .fetch_optional(pool)
            .await
            .ok()
            .flatten()
            .map(|(n,)| n)
    } else {
        None
    };

    Ok(InvoicePreview {
        invoice_number: None,
        period_start,
        period_end,
        total_hours,
        hourly_rate,
        total_amount,
        format,
        layout_data,
        name,
        client_id,
        client_name,
        issued_at: now_iso(),
        entries,
    })
}

async fn create_invoice_internal(
    pool: &SqlitePool,
    period_start: String,
    period_end: String,
    entry_ids: Vec<String>,
    format: String,
    layout_data: Option<String>,
    name: Option<String>,
    client_id: Option<String>,
) -> Result<InvoiceWithEntries, String> {
    let selected_ids: HashSet<String> = entry_ids.into_iter().collect();
    if selected_ids.is_empty() {
        return Err("Select at least one entry before creating an invoice".into());
    }

    let hourly_rate = resolve_hourly_rate(pool, client_id.as_deref()).await?;
    let rounding = get_time_rounding(pool).await;

    // Snapshot the client name so the invoice stays readable after client edits.
    let client_name: Option<String> = if let Some(ref cid) = client_id {
        sqlx::query_as::<_, (String,)>("SELECT name FROM clients WHERE id = ?")
            .bind(cid)
            .fetch_optional(pool)
            .await
            .ok()
            .flatten()
            .map(|(n,)| n)
    } else {
        None
    };

    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

    let eligible_entries: Vec<TimeEntry> = if let Some(ref cid) = client_id {
        sqlx::query_as(&format!(
            "{}{}",
            live_entry_query(
                "WHERE time_entries.date >= ?
                   AND time_entries.date <= ?
                   AND time_entries.end_time IS NOT NULL
                   AND time_entries.invoiced = 0
                   AND time_entries.client_id = ?"
            ),
            LIVE_ENTRY_ORDER
        ))
        .bind(&period_start)
        .bind(&period_end)
        .bind(cid)
        .fetch_all(&mut *tx)
        .await
        .map_err(|e| e.to_string())?
    } else {
        sqlx::query_as(&format!(
            "{}{}",
            live_entry_query(
                "WHERE time_entries.date >= ?
                   AND time_entries.date <= ?
                   AND time_entries.end_time IS NOT NULL
                   AND time_entries.invoiced = 0"
            ),
            LIVE_ENTRY_ORDER
        ))
        .bind(&period_start)
        .bind(&period_end)
        .fetch_all(&mut *tx)
        .await
        .map_err(|e| e.to_string())?
    };

    let mut entries: Vec<TimeEntry> = eligible_entries
        .into_iter()
        .filter(|entry| selected_ids.contains(&entry.id))
        .collect();

    if entries.len() != selected_ids.len() {
        return Err("One or more selected entries are no longer available for invoicing".into());
    }

    if entries.is_empty() {
        return Err(empty_entries_error());
    }

    let (total_hours, total_amount) = invoice_totals(&entries, hourly_rate, &rounding);

    let month_str = &period_start[..7].replace('-', "");
    let count: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM invoices")
        .fetch_one(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    let invoice_number = format!("INV-{}-{:03}", month_str, count.0 + 1);

    let id = Uuid::new_v4().to_string();
    let now = now_iso();

    sqlx::query(
        "INSERT INTO invoices (
            id, invoice_number, period_start, period_end, total_hours, hourly_rate, total_amount,
            status, pdf_path, created_at, issued_at, sent_at, due_at, paid_at, locked_at,
            format, layout_data, name, client_id, client_name
         )
         VALUES (?, ?, ?, ?, ?, ?, ?, 'draft', NULL, ?, NULL, NULL, NULL, NULL, NULL, ?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(&invoice_number)
    .bind(&period_start)
    .bind(&period_end)
    .bind(total_hours)
    .bind(hourly_rate)
    .bind(total_amount)
    .bind(&now)
    .bind(&format)
    .bind(&layout_data)
    .bind(&name)
    .bind(&client_id)
    .bind(&client_name)
    .execute(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;

    for entry in &mut entries {
        sqlx::query(
            "UPDATE time_entries
             SET invoiced = 1, invoice_id = ?, updated_at = ?
             WHERE id = ?",
        )
        .bind(&id)
        .bind(&now)
        .bind(&entry.id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
        entry.invoiced = true;
        entry.invoice_id = Some(id.clone());
        entry.updated_at = now.clone();
    }

    tx.commit().await.map_err(|e| e.to_string())?;

    let invoice = fetch_invoice_by_id(pool, &id).await?;
    Ok(InvoiceWithEntries { invoice, entries })
}

pub async fn ensure_invoice_editable(pool: &SqlitePool, invoice_id: &str) -> Result<Invoice, String> {
    let invoice = fetch_invoice_by_id(pool, invoice_id).await?;
    if invoice.is_locked {
        Err("Entries linked to sent or paid invoices are locked".into())
    } else {
        Ok(invoice)
    }
}

pub async fn sync_invoice_totals(pool: &SqlitePool, invoice_id: &str) -> Result<(), String> {
    let invoice = ensure_invoice_editable(pool, invoice_id).await?;
    let entries = fetch_invoice_live_entries(pool, invoice_id).await?;
    let rounding = get_time_rounding(pool).await;
    let (total_hours, total_amount) = invoice_totals(&entries, invoice.hourly_rate, &rounding);

    sqlx::query("UPDATE invoices SET total_hours = ?, total_amount = ? WHERE id = ?")
        .bind(total_hours)
        .bind(total_amount)
        .bind(invoice_id)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}

fn validate_status(invoice: &Invoice, expected: &str) -> Result<(), String> {
    if invoice.status != expected {
        Err(format!("Invoice must be {} before this action", expected))
    } else {
        Ok(())
    }
}

async fn issue_invoice_internal(
    pool: &SqlitePool,
    invoice_id: &str,
    issued_at: String,
    due_at: String,
) -> Result<Invoice, String> {
    let invoice = fetch_invoice_by_id(pool, invoice_id).await?;
    if invoice.status != "draft" && invoice.status != "issued" {
        return Err("Invoice must be draft or issued before this action".into());
    }

    let effective_issued_at = invoice.issued_at.unwrap_or(issued_at);

    sqlx::query(
        "UPDATE invoices
         SET status = 'issued', issued_at = ?, due_at = ?
         WHERE id = ?",
    )
    .bind(&effective_issued_at)
    .bind(&due_at)
    .bind(invoice_id)
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;

    fetch_invoice_by_id(pool, invoice_id).await
}

async fn send_invoice_internal(
    pool: &SqlitePool,
    invoice_id: &str,
    sent_at: String,
) -> Result<Invoice, String> {
    let invoice = fetch_invoice_by_id(pool, invoice_id).await?;
    validate_status(&invoice, "issued")?;

    let live_entries = fetch_invoice_live_entries(pool, invoice_id).await?;
    if live_entries.is_empty() {
        return Err("Cannot send an invoice with no linked entries".into());
    }

    let rounding = get_time_rounding(pool).await;
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;
    sqlx::query("DELETE FROM invoice_entry_snapshots WHERE invoice_id = ?")
        .bind(invoice_id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

    for entry in &live_entries {
        let mins = apply_rounding(entry.duration_minutes.unwrap_or(0), &rounding);
        let hours = mins as f64 / 60.0;
        let entry_rate = resolve_entry_rate(entry.hourly_rate, invoice.hourly_rate);
        let billable = entry.billable;
        let billed_minutes = if billable { mins } else { 0 };
        let amount = if billable {
            (hours * entry_rate * 100.0).round() / 100.0
        } else {
            0.0
        };

        sqlx::query(
            "INSERT INTO invoice_entry_snapshots (
                id, invoice_id, entry_id, date, start_time, end_time, duration_minutes, description,
                tag_id, tag_name, tag_color, billable, billed_minutes, hourly_rate, amount, created_at
             )
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(Uuid::new_v4().to_string())
        .bind(invoice_id)
        .bind(&entry.id)
        .bind(&entry.date)
        .bind(&entry.start_time)
        .bind(&entry.end_time)
        .bind(entry.duration_minutes)
        .bind(&entry.description)
        .bind(&entry.tag_id)
        .bind(&entry.tag_name)
        .bind(&entry.tag_color)
        .bind(billable)
        .bind(billed_minutes)
        .bind(entry_rate)
        .bind(amount)
        .bind(&sent_at)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    }

    sqlx::query(
        "UPDATE invoices
         SET status = 'sent', sent_at = ?, locked_at = ?
         WHERE id = ?",
    )
    .bind(&sent_at)
    .bind(&sent_at)
    .bind(invoice_id)
    .execute(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;

    tx.commit().await.map_err(|e| e.to_string())?;

    fetch_invoice_by_id(pool, invoice_id).await
}

#[tauri::command]
pub async fn preview_invoice(
    pool: tauri::State<'_, SqlitePool>,
    period_start: String,
    period_end: String,
    format: String,
    layout_data: Option<String>,
    name: Option<String>,
    client_id: Option<String>,
) -> Result<InvoicePreview, String> {
    preview_invoice_internal(
        pool.inner(),
        period_start,
        period_end,
        format,
        layout_data,
        name,
        client_id,
    )
    .await
}

#[tauri::command]
pub async fn create_invoice(
    pool: tauri::State<'_, SqlitePool>,
    app: tauri::AppHandle,
    period_start: String,
    period_end: String,
    entry_ids: Vec<String>,
    format: String,
    layout_data: Option<String>,
    name: Option<String>,
    client_id: Option<String>,
) -> Result<InvoiceWithEntries, String> {
    let result = create_invoice_internal(
        pool.inner(),
        period_start,
        period_end,
        entry_ids,
        format,
        layout_data,
        name,
        client_id,
    )
    .await?;
    backup::run_auto_backup_if_enabled(pool.inner(), &app, "invoice-create").await;
    Ok(result)
}

#[tauri::command]
pub async fn list_invoices(pool: tauri::State<'_, SqlitePool>) -> Result<Vec<Invoice>, String> {
    sqlx::query_as(&invoice_select_query("ORDER BY invoices.created_at DESC"))
        .fetch_all(pool.inner())
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn regenerate_invoice(
    pool: tauri::State<'_, SqlitePool>,
    invoice_id: String,
) -> Result<InvoiceWithEntries, String> {
    let invoice = fetch_invoice_by_id(pool.inner(), &invoice_id).await?;
    let entries = if invoice.is_locked {
        fetch_invoice_snapshot_entries(pool.inner(), &invoice_id).await?
    } else {
        fetch_invoice_live_entries(pool.inner(), &invoice_id).await?
    };

    Ok(InvoiceWithEntries { invoice, entries })
}

#[tauri::command]
pub async fn issue_invoice(
    pool: tauri::State<'_, SqlitePool>,
    app: tauri::AppHandle,
    invoice_id: String,
    issued_at: String,
    due_at: String,
) -> Result<Invoice, String> {
    let invoice = issue_invoice_internal(pool.inner(), &invoice_id, issued_at, due_at).await?;
    backup::run_auto_backup_if_enabled(pool.inner(), &app, "invoice-issue").await;
    Ok(invoice)
}

#[tauri::command]
pub async fn revert_invoice_to_draft(
    pool: tauri::State<'_, SqlitePool>,
    app: tauri::AppHandle,
    invoice_id: String,
) -> Result<Invoice, String> {
    let invoice = fetch_invoice_by_id(pool.inner(), &invoice_id).await?;
    validate_status(&invoice, "issued")?;

    sqlx::query(
        "UPDATE invoices
         SET status = 'draft', issued_at = NULL, sent_at = NULL, due_at = NULL, paid_at = NULL, locked_at = NULL
         WHERE id = ?",
    )
    .bind(&invoice_id)
    .execute(pool.inner())
    .await
    .map_err(|e| e.to_string())?;

    let invoice = fetch_invoice_by_id(pool.inner(), &invoice_id).await?;
    backup::run_auto_backup_if_enabled(pool.inner(), &app, "invoice-revert").await;
    Ok(invoice)
}

#[tauri::command]
pub async fn cancel_invoice(
    pool: tauri::State<'_, SqlitePool>,
    app: tauri::AppHandle,
    invoice_id: String,
) -> Result<Invoice, String> {
    let invoice = fetch_invoice_by_id(pool.inner(), &invoice_id).await?;
    if invoice.status == "draft" {
        return Err("Invoice is already a draft".into());
    }

    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

    // Free all time entries linked to this invoice
    sqlx::query("UPDATE time_entries SET invoiced = 0, invoice_id = NULL WHERE invoice_id = ?")
        .bind(&invoice_id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

    // Remove any locked snapshots
    sqlx::query("DELETE FROM invoice_entry_snapshots WHERE invoice_id = ?")
        .bind(&invoice_id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

    // Reset invoice to draft
    sqlx::query(
        "UPDATE invoices
         SET status = 'draft', issued_at = NULL, sent_at = NULL,
             due_at = NULL, paid_at = NULL, locked_at = NULL
         WHERE id = ?",
    )
    .bind(&invoice_id)
    .execute(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;

    tx.commit().await.map_err(|e| e.to_string())?;

    let invoice = fetch_invoice_by_id(pool.inner(), &invoice_id).await?;
    backup::run_auto_backup_if_enabled(pool.inner(), &app, "invoice-cancel").await;
    Ok(invoice)
}

#[tauri::command]
pub async fn send_invoice(
    pool: tauri::State<'_, SqlitePool>,
    app: tauri::AppHandle,
    invoice_id: String,
    sent_at: String,
) -> Result<Invoice, String> {
    let invoice = send_invoice_internal(pool.inner(), &invoice_id, sent_at).await?;
    backup::run_auto_backup_if_enabled(pool.inner(), &app, "invoice-send").await;
    Ok(invoice)
}

#[tauri::command]
pub async fn mark_invoice_paid(
    pool: tauri::State<'_, SqlitePool>,
    app: tauri::AppHandle,
    invoice_id: String,
    paid_at: String,
) -> Result<Invoice, String> {
    let invoice = fetch_invoice_by_id(pool.inner(), &invoice_id).await?;
    validate_status(&invoice, "sent")?;

    sqlx::query(
        "UPDATE invoices
         SET status = 'paid', paid_at = ?
         WHERE id = ?",
    )
    .bind(&paid_at)
    .bind(&invoice_id)
    .execute(pool.inner())
    .await
    .map_err(|e| e.to_string())?;

    let invoice = fetch_invoice_by_id(pool.inner(), &invoice_id).await?;
    backup::run_auto_backup_if_enabled(pool.inner(), &app, "invoice-mark-paid").await;
    Ok(invoice)
}

#[tauri::command]
pub async fn get_invoice_entries(
    pool: tauri::State<'_, SqlitePool>,
    invoice_id: String,
) -> Result<Vec<TimeEntry>, String> {
    let invoice = fetch_invoice_by_id(pool.inner(), &invoice_id).await?;
    if invoice.is_locked {
        fetch_invoice_snapshot_entries(pool.inner(), &invoice_id).await
    } else {
        fetch_invoice_live_entries(pool.inner(), &invoice_id).await
    }
}

#[tauri::command]
pub async fn delete_invoice(
    pool: tauri::State<'_, SqlitePool>,
    app: tauri::AppHandle,
    invoice_id: String,
) -> Result<(), String> {
    let invoice = fetch_invoice_by_id(pool.inner(), &invoice_id).await?;
    if invoice.is_locked {
        return Err("Sent or paid invoices cannot be deleted".into());
    }

    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

    sqlx::query(
        "UPDATE time_entries
         SET invoiced = 0, invoice_id = NULL
         WHERE invoice_id = ?",
    )
    .bind(&invoice_id)
    .execute(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;

    sqlx::query("DELETE FROM invoice_entry_snapshots WHERE invoice_id = ?")
        .bind(&invoice_id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

    sqlx::query("DELETE FROM invoices WHERE id = ?")
        .bind(&invoice_id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

    tx.commit().await.map_err(|e| e.to_string())?;

    backup::run_auto_backup_if_enabled(pool.inner(), &app, "invoice-delete").await;
    Ok(())
}

#[tauri::command]
pub async fn save_invoice_pdf(
    pool: tauri::State<'_, SqlitePool>,
    app: tauri::AppHandle,
    invoice_id: String,
    path: String,
    bytes: Vec<u8>,
) -> Result<Invoice, String> {
    fetch_invoice_by_id(pool.inner(), &invoice_id).await?;

    if path.trim().is_empty() {
        return Err("Choose a PDF destination".into());
    }
    if bytes.is_empty() {
        return Err("Cannot save an empty PDF".into());
    }

    if let Some(parent) = Path::new(&path).parent() {
        if !parent.as_os_str().is_empty() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
    }

    fs::write(&path, bytes).map_err(|e| e.to_string())?;

    sqlx::query("UPDATE invoices SET pdf_path = ? WHERE id = ?")
        .bind(&path)
        .bind(&invoice_id)
        .execute(pool.inner())
        .await
        .map_err(|e| e.to_string())?;

    let invoice = fetch_invoice_by_id(pool.inner(), &invoice_id).await?;
    backup::run_auto_backup_if_enabled(pool.inner(), &app, "invoice-save-pdf").await;
    Ok(invoice)
}

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::sqlite::SqlitePoolOptions;

    async fn setup_pool() -> SqlitePool {
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .expect("in-memory sqlite");

        sqlx::query(include_str!("../db/migrations/001_initial.sql"))
            .execute(&pool)
            .await
            .expect("migration 001");

        for stmt in [
            "ALTER TABLE invoices ADD COLUMN format TEXT NOT NULL DEFAULT 'detailed'",
            "ALTER TABLE invoices ADD COLUMN layout_data TEXT",
            "ALTER TABLE invoices ADD COLUMN name TEXT",
            "ALTER TABLE time_entries ADD COLUMN client_id TEXT",
            "ALTER TABLE invoices ADD COLUMN client_id TEXT",
            "ALTER TABLE invoices ADD COLUMN client_name TEXT",
            "CREATE TABLE IF NOT EXISTS clients (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL UNIQUE,
                hourly_rate REAL NOT NULL DEFAULT 0,
                billing_name TEXT,
                billing_email TEXT,
                is_default INTEGER NOT NULL DEFAULT 0,
                is_archived INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )",
            "ALTER TABLE clients ADD COLUMN billing_name TEXT",
            "ALTER TABLE clients ADD COLUMN billing_email TEXT",
            "ALTER TABLE time_entries ADD COLUMN billable INTEGER NOT NULL DEFAULT 1",
            "ALTER TABLE time_entries ADD COLUMN hourly_rate REAL",
            "ALTER TABLE invoice_entry_snapshots ADD COLUMN billable INTEGER NOT NULL DEFAULT 1",
            "ALTER TABLE invoice_entry_snapshots ADD COLUMN billed_minutes INTEGER",
            "INSERT OR IGNORE INTO settings (key, value) VALUES ('time_rounding', 'none')",
        ] {
            let _ = sqlx::query(stmt).execute(&pool).await;
        }

        pool
    }

    async fn insert_entry(
        pool: &SqlitePool,
        id: &str,
        date: &str,
        invoiced: bool,
        invoice_id: Option<&str>,
    ) {
        sqlx::query(
            "INSERT INTO time_entries (
                id, date, start_time, end_time, duration_minutes, description, entry_type, tag_id,
                invoiced, invoice_id, created_at, updated_at
             )
             VALUES (?, ?, '09:00:00', '11:00:00', 120, 'Test work', 'Work', 'default-work', ?, ?, '2026-03-01T09:00:00', '2026-03-01T11:00:00')",
        )
        .bind(id)
        .bind(date)
        .bind(if invoiced { 1 } else { 0 })
        .bind(invoice_id)
        .execute(pool)
        .await
        .expect("insert entry");
    }

    #[tokio::test]
    async fn preview_excludes_already_invoiced_entries() {
        let pool = setup_pool().await;
        insert_entry(&pool, "entry-1", "2026-03-05", false, None).await;
        insert_entry(&pool, "entry-2", "2026-03-06", true, Some("inv-old")).await;

        let preview = preview_invoice_internal(
            &pool,
            "2026-03-01".into(),
            "2026-03-31".into(),
            "detailed".into(),
            None,
            None,
            None,
        )
        .await
        .expect("preview");

        assert_eq!(preview.entries.len(), 1);
        assert_eq!(preview.entries[0].id, "entry-1");
        assert_eq!(preview.total_hours, 2.0);
    }

    #[tokio::test]
    async fn preview_does_not_mutate_entries_or_invoices() {
        let pool = setup_pool().await;
        insert_entry(&pool, "entry-1", "2026-03-05", false, None).await;

        let _ = preview_invoice_internal(
            &pool,
            "2026-03-01".into(),
            "2026-03-31".into(),
            "detailed".into(),
            None,
            None,
            None,
        )
        .await
        .expect("preview");

        let invoice_count: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM invoices")
            .fetch_one(&pool)
            .await
            .expect("invoice count");
        let row: (i64, Option<String>) =
            sqlx::query_as("SELECT invoiced, invoice_id FROM time_entries WHERE id = 'entry-1'")
                .fetch_one(&pool)
                .await
                .expect("entry row");

        assert_eq!(invoice_count.0, 0);
        assert_eq!(row.0, 0);
        assert_eq!(row.1, None);
    }

    #[tokio::test]
    async fn create_invoice_marks_selected_entries_and_blocks_reuse() {
        let pool = setup_pool().await;
        insert_entry(&pool, "entry-1", "2026-03-05", false, None).await;
        insert_entry(&pool, "entry-2", "2026-03-06", false, None).await;
        insert_entry(&pool, "entry-3", "2026-03-07", false, None).await;

        let created = create_invoice_internal(
            &pool,
            "2026-03-01".into(),
            "2026-03-31".into(),
            vec!["entry-1".into(), "entry-3".into()],
            "detailed".into(),
            None,
            Some("March work".into()),
            None,
        )
        .await
        .expect("create invoice");

        assert_eq!(created.entries.len(), 2);
        assert_eq!(created.invoice.total_hours, 4.0);
        assert_eq!(created.invoice.name.as_deref(), Some("March work"));

        let links: Vec<(String, i64, Option<String>)> = sqlx::query_as(
            "SELECT id, invoiced, invoice_id FROM time_entries ORDER BY id ASC",
        )
        .fetch_all(&pool)
        .await
        .expect("linked rows");

        assert_eq!(links[0].1, 1);
        assert_eq!(links[0].2.as_deref(), Some(created.invoice.id.as_str()));
        assert_eq!(links[1].1, 0);
        assert_eq!(links[1].2, None);
        assert_eq!(links[2].1, 1);
        assert_eq!(links[2].2.as_deref(), Some(created.invoice.id.as_str()));

        let second_attempt = create_invoice_internal(
            &pool,
            "2026-03-01".into(),
            "2026-03-31".into(),
            vec!["entry-1".into()],
            "detailed".into(),
            None,
            None,
            None,
        )
        .await;

        assert!(second_attempt.is_err());
    }

    #[tokio::test]
    async fn sending_invoice_creates_snapshots_and_locks_it() {
        let pool = setup_pool().await;
        insert_entry(&pool, "entry-1", "2026-03-05", false, None).await;

        let created = create_invoice_internal(
            &pool,
            "2026-03-01".into(),
            "2026-03-31".into(),
            vec!["entry-1".into()],
            "detailed".into(),
            None,
            None,
            None,
        )
        .await
        .expect("create invoice");

        let _ = issue_invoice_internal(
            &pool,
            &created.invoice.id,
            "2026-03-10".into(),
            "2026-04-09".into(),
        )
        .await
        .expect("issue invoice");

        let sent = send_invoice_internal(
            &pool,
            &created.invoice.id,
            "2026-03-11T12:00:00".into(),
        )
        .await
        .expect("send invoice");

        assert_eq!(sent.status, "sent");
        assert!(sent.is_locked);

        let snapshots: (i64,) =
            sqlx::query_as("SELECT COUNT(*) FROM invoice_entry_snapshots WHERE invoice_id = ?")
                .bind(&created.invoice.id)
                .fetch_one(&pool)
                .await
                .expect("snapshot count");
        assert_eq!(snapshots.0, 1);
    }
}
