use chrono::Local;
use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use uuid::Uuid;

#[derive(Debug, Serialize, Deserialize, Clone, sqlx::FromRow)]
pub struct Client {
    pub id: String,
    pub name: String,
    pub hourly_rate: f64,
    pub is_default: bool,
    pub is_archived: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateClientArgs {
    pub name: String,
    pub hourly_rate: f64,
}

#[derive(Debug, Deserialize)]
pub struct UpdateClientArgs {
    pub id: String,
    pub name: String,
    pub hourly_rate: f64,
}

fn now_iso() -> String {
    Local::now().format("%Y-%m-%dT%H:%M:%S").to_string()
}

const CLIENT_SELECT: &str =
    "SELECT id, name, hourly_rate, is_default, is_archived, created_at, updated_at FROM clients";

pub async fn get_client_by_id(pool: &SqlitePool, id: &str) -> Result<Client, String> {
    sqlx::query_as(&format!("{} WHERE id = ?", CLIENT_SELECT))
        .bind(id)
        .fetch_one(pool)
        .await
        .map_err(|e| e.to_string())
}

pub async fn get_default_client(pool: &SqlitePool) -> Result<Option<Client>, String> {
    sqlx::query_as(&format!(
        "{} WHERE is_default = 1 AND is_archived = 0 LIMIT 1",
        CLIENT_SELECT
    ))
    .fetch_optional(pool)
    .await
    .map_err(|e| e.to_string())
}

/// Returns the hourly rate for a client, or falls back to the global settings rate.
pub async fn resolve_hourly_rate(
    pool: &SqlitePool,
    client_id: Option<&str>,
) -> Result<f64, String> {
    if let Some(cid) = client_id {
        let row: Option<(f64,)> =
            sqlx::query_as("SELECT hourly_rate FROM clients WHERE id = ?")
                .bind(cid)
                .fetch_optional(pool)
                .await
                .map_err(|e| e.to_string())?;
        if let Some((rate,)) = row {
            return Ok(rate);
        }
    }
    let rate_row: (String,) =
        sqlx::query_as("SELECT value FROM settings WHERE key = 'hourly_rate'")
            .fetch_one(pool)
            .await
            .map_err(|e| e.to_string())?;
    Ok(rate_row.0.parse().unwrap_or(75.0))
}

#[tauri::command]
pub async fn list_clients(pool: tauri::State<'_, SqlitePool>) -> Result<Vec<Client>, String> {
    sqlx::query_as(&format!(
        "{} ORDER BY is_default DESC, name ASC",
        CLIENT_SELECT
    ))
    .fetch_all(pool.inner())
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_client(
    pool: tauri::State<'_, SqlitePool>,
    args: CreateClientArgs,
) -> Result<Client, String> {
    let id = Uuid::new_v4().to_string();
    let now = now_iso();

    // First active client becomes the default automatically.
    let count: (i64,) =
        sqlx::query_as("SELECT COUNT(*) FROM clients WHERE is_archived = 0")
            .fetch_one(pool.inner())
            .await
            .map_err(|e| e.to_string())?;
    let is_default: i64 = if count.0 == 0 { 1 } else { 0 };

    sqlx::query(
        "INSERT INTO clients (id, name, hourly_rate, is_default, is_archived, created_at, updated_at)
         VALUES (?, ?, ?, ?, 0, ?, ?)",
    )
    .bind(&id)
    .bind(&args.name)
    .bind(args.hourly_rate)
    .bind(is_default)
    .bind(&now)
    .bind(&now)
    .execute(pool.inner())
    .await
    .map_err(|e| e.to_string())?;

    get_client_by_id(pool.inner(), &id).await
}

#[tauri::command]
pub async fn update_client(
    pool: tauri::State<'_, SqlitePool>,
    args: UpdateClientArgs,
) -> Result<Client, String> {
    let now = now_iso();
    sqlx::query(
        "UPDATE clients SET name = ?, hourly_rate = ?, updated_at = ? WHERE id = ?",
    )
    .bind(&args.name)
    .bind(args.hourly_rate)
    .bind(&now)
    .bind(&args.id)
    .execute(pool.inner())
    .await
    .map_err(|e| e.to_string())?;

    get_client_by_id(pool.inner(), &args.id).await
}

#[tauri::command]
pub async fn set_default_client(
    pool: tauri::State<'_, SqlitePool>,
    id: String,
) -> Result<Client, String> {
    let now = now_iso();
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

    sqlx::query("UPDATE clients SET is_default = 0, updated_at = ?")
        .bind(&now)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

    sqlx::query("UPDATE clients SET is_default = 1, updated_at = ? WHERE id = ?")
        .bind(&now)
        .bind(&id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

    tx.commit().await.map_err(|e| e.to_string())?;
    get_client_by_id(pool.inner(), &id).await
}

#[tauri::command]
pub async fn archive_client(
    pool: tauri::State<'_, SqlitePool>,
    id: String,
) -> Result<Client, String> {
    let now = now_iso();
    sqlx::query(
        "UPDATE clients SET is_archived = 1, is_default = 0, updated_at = ? WHERE id = ?",
    )
    .bind(&now)
    .bind(&id)
    .execute(pool.inner())
    .await
    .map_err(|e| e.to_string())?;

    get_client_by_id(pool.inner(), &id).await
}

#[tauri::command]
pub async fn unarchive_client(
    pool: tauri::State<'_, SqlitePool>,
    id: String,
) -> Result<Client, String> {
    let now = now_iso();
    sqlx::query("UPDATE clients SET is_archived = 0, updated_at = ? WHERE id = ?")
        .bind(&now)
        .bind(&id)
        .execute(pool.inner())
        .await
        .map_err(|e| e.to_string())?;

    get_client_by_id(pool.inner(), &id).await
}
