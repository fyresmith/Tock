use sqlx::{sqlite::SqlitePoolOptions, SqlitePool};
use std::fs;
use tauri::{AppHandle, Manager};
use uuid::Uuid;

pub fn app_data_dir(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    app.path().app_data_dir().map_err(|e| e.to_string())
}

pub fn db_path(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    Ok(app_data_dir(app)?.join("tock.db"))
}

pub async fn init_db(app: &AppHandle) -> Result<SqlitePool, String> {
    let data_dir = app_data_dir(app)?;

    fs::create_dir_all(&data_dir).map_err(|e| e.to_string())?;

    let db_path = db_path(app)?;
    let db_url = format!("sqlite://{}?mode=rwc", db_path.display());

    let pool = SqlitePoolOptions::new()
        .max_connections(5)
        .connect(&db_url)
        .await
        .map_err(|e| e.to_string())?;

    run_migrations(&pool).await?;

    Ok(pool)
}

async fn run_migrations(pool: &SqlitePool) -> Result<(), String> {
    sqlx::query(include_str!("migrations/001_initial.sql"))
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;

    // 002: Add format and layout_data columns — silently ignore "duplicate column name"
    // errors so this is safe to run on an already-migrated database.
    for stmt in [
        "ALTER TABLE invoices ADD COLUMN format TEXT NOT NULL DEFAULT 'detailed'",
        "ALTER TABLE invoices ADD COLUMN layout_data TEXT",
    ] {
        let _ = sqlx::query(stmt).execute(pool).await;
    }

    // 003: Add optional invoice name column
    let _ = sqlx::query("ALTER TABLE invoices ADD COLUMN name TEXT")
        .execute(pool)
        .await;

    // 004: Add clients table and client_id columns
    sqlx::query(
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
    )
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;

    for stmt in [
        "ALTER TABLE clients ADD COLUMN billing_name TEXT",
        "ALTER TABLE clients ADD COLUMN billing_email TEXT",
        "ALTER TABLE time_entries ADD COLUMN client_id TEXT",
        "ALTER TABLE invoices ADD COLUMN client_id TEXT",
        "ALTER TABLE invoices ADD COLUMN client_name TEXT",
    ] {
        let _ = sqlx::query(stmt).execute(pool).await;
    }

    for stmt in [
        "ALTER TABLE time_entries ADD COLUMN tag_id TEXT",
        "ALTER TABLE invoices ADD COLUMN issued_at TEXT",
        "ALTER TABLE invoices ADD COLUMN sent_at TEXT",
        "ALTER TABLE invoices ADD COLUMN due_at TEXT",
        "ALTER TABLE invoices ADD COLUMN paid_at TEXT",
        "ALTER TABLE invoices ADD COLUMN locked_at TEXT",
    ] {
        let _ = sqlx::query(stmt).execute(pool).await;
    }

    sqlx::query(
        "CREATE TABLE IF NOT EXISTS entry_tags (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL UNIQUE,
            color TEXT NOT NULL,
            sort_order INTEGER NOT NULL DEFAULT 0,
            is_archived INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )",
    )
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;

    sqlx::query(
        "CREATE TABLE IF NOT EXISTS invoice_entry_snapshots (
            id TEXT PRIMARY KEY,
            invoice_id TEXT NOT NULL,
            entry_id TEXT,
            date TEXT NOT NULL,
            start_time TEXT NOT NULL,
            end_time TEXT,
            duration_minutes INTEGER,
            description TEXT NOT NULL,
            tag_id TEXT,
            tag_name TEXT NOT NULL,
            tag_color TEXT NOT NULL,
            billable INTEGER NOT NULL DEFAULT 1,
            billed_minutes INTEGER,
            hourly_rate REAL NOT NULL,
            amount REAL NOT NULL,
            created_at TEXT NOT NULL
        )",
    )
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;

    // 005: billable flag, per-entry rate, and time rounding setting
    for stmt in [
        "ALTER TABLE time_entries ADD COLUMN billable INTEGER NOT NULL DEFAULT 1",
        "ALTER TABLE time_entries ADD COLUMN hourly_rate REAL",
        "ALTER TABLE invoice_entry_snapshots ADD COLUMN billable INTEGER NOT NULL DEFAULT 1",
        "ALTER TABLE invoice_entry_snapshots ADD COLUMN billed_minutes INTEGER",
        "INSERT OR IGNORE INTO settings (key, value) VALUES ('backup_directory', '')",
        "INSERT OR IGNORE INTO settings (key, value) VALUES ('auto_backup_enabled', '1')",
        "INSERT OR IGNORE INTO settings (key, value) VALUES ('time_rounding', 'none')",
        "INSERT OR IGNORE INTO settings (key, value) VALUES ('command_palette_shortcut', 'mod+k')",
        "INSERT OR IGNORE INTO settings (key, value) VALUES ('quick_add_entry_shortcut', 'mod+shift+n')",
        "INSERT OR IGNORE INTO settings (key, value) VALUES ('stop_timer_shortcut', 'mod+enter')",
    ] {
        let _ = sqlx::query(stmt).execute(pool).await;
    }

    seed_default_tags(pool).await?;
    backfill_entry_tags(pool).await?;

    Ok(())
}

fn now_iso() -> String {
    chrono::Local::now()
        .format("%Y-%m-%dT%H:%M:%S")
        .to_string()
}

async fn seed_default_tags(pool: &SqlitePool) -> Result<(), String> {
    let now = now_iso();
    for (id, name, color, sort_order) in [
        ("default-work", "Work", "#22c55e", 0_i64),
        ("default-meeting", "Meeting", "#f59e0b", 1_i64),
        ("default-admin", "Admin", "#64748b", 2_i64),
    ] {
        sqlx::query(
            "INSERT OR IGNORE INTO entry_tags (id, name, color, sort_order, is_archived, created_at, updated_at)
             VALUES (?, ?, ?, ?, 0, ?, ?)",
        )
        .bind(id)
        .bind(name)
        .bind(color)
        .bind(sort_order)
        .bind(&now)
        .bind(&now)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;
    }

    Ok(())
}

async fn backfill_entry_tags(pool: &SqlitePool) -> Result<(), String> {
    let existing_types: Vec<(String,)> = sqlx::query_as(
        "SELECT DISTINCT TRIM(entry_type) AS entry_type
         FROM time_entries
         WHERE (tag_id IS NULL OR tag_id = '')
           AND TRIM(entry_type) != ''",
    )
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;

    let now = now_iso();
    let mut next_sort_order: i64 = sqlx::query_as::<_, (i64,)>(
        "SELECT COALESCE(MAX(sort_order), -1) + 1 FROM entry_tags",
    )
    .fetch_one(pool)
    .await
    .map_err(|e| e.to_string())?
    .0;

    for (entry_type,) in existing_types {
        let maybe_tag: Option<(String,)> = sqlx::query_as(
            "SELECT id FROM entry_tags WHERE LOWER(name) = LOWER(?) LIMIT 1",
        )
        .bind(&entry_type)
        .fetch_optional(pool)
        .await
        .map_err(|e| e.to_string())?;

        let tag_id = if let Some((id,)) = maybe_tag {
            id
        } else {
            let id = Uuid::new_v4().to_string();
            sqlx::query(
                "INSERT INTO entry_tags (id, name, color, sort_order, is_archived, created_at, updated_at)
                 VALUES (?, ?, '#64748b', ?, 0, ?, ?)",
            )
            .bind(&id)
            .bind(&entry_type)
            .bind(next_sort_order)
            .bind(&now)
            .bind(&now)
            .execute(pool)
            .await
            .map_err(|e| e.to_string())?;
            next_sort_order += 1;
            id
        };

        sqlx::query(
            "UPDATE time_entries
             SET tag_id = ?, updated_at = ?
             WHERE (tag_id IS NULL OR tag_id = '')
               AND entry_type = ?",
        )
        .bind(&tag_id)
        .bind(&now)
        .bind(&entry_type)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;
    }

    let fallback_tag: (String, String) = sqlx::query_as(
        "SELECT id, name
         FROM entry_tags
         WHERE is_archived = 0
         ORDER BY sort_order ASC, created_at ASC
         LIMIT 1",
    )
    .fetch_one(pool)
    .await
    .map_err(|e| e.to_string())?;

    sqlx::query(
        "UPDATE time_entries
         SET tag_id = ?, entry_type = CASE WHEN TRIM(entry_type) = '' THEN ? ELSE entry_type END, updated_at = ?
         WHERE tag_id IS NULL OR tag_id = ''",
    )
    .bind(&fallback_tag.0)
    .bind(&fallback_tag.1)
    .bind(&now)
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(())
}
