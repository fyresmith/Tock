use chrono::Local;
use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use uuid::Uuid;

use crate::backup;

#[derive(Debug, Serialize, Deserialize, Clone, sqlx::FromRow)]
pub struct EntryTag {
    pub id: String,
    pub name: String,
    pub color: String,
    pub sort_order: i64,
    pub is_archived: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateTagArgs {
    pub name: String,
    pub color: String,
}

#[derive(Debug, Deserialize)]
pub struct UpdateTagArgs {
    pub id: String,
    pub name: String,
    pub color: String,
}

fn now_iso() -> String {
    Local::now().format("%Y-%m-%dT%H:%M:%S").to_string()
}

fn normalize_name(name: &str) -> Result<String, String> {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err("Tag name is required".into());
    }
    Ok(trimmed.to_string())
}

fn normalize_color(color: &str) -> String {
    let trimmed = color.trim();
    if trimmed.is_empty() {
        "#64748b".into()
    } else {
        trimmed.to_string()
    }
}

async fn ensure_unique_name(
    pool: &SqlitePool,
    name: &str,
    exclude_id: Option<&str>,
) -> Result<(), String> {
    let existing: Option<(String,)> = if let Some(id) = exclude_id {
        sqlx::query_as(
            "SELECT id FROM entry_tags WHERE LOWER(name) = LOWER(?) AND id != ? LIMIT 1",
        )
        .bind(name)
        .bind(id)
        .fetch_optional(pool)
        .await
        .map_err(|e| e.to_string())?
    } else {
        sqlx::query_as("SELECT id FROM entry_tags WHERE LOWER(name) = LOWER(?) LIMIT 1")
            .bind(name)
            .fetch_optional(pool)
            .await
            .map_err(|e| e.to_string())?
    };

    if existing.is_some() {
        Err(format!("A tag named \"{}\" already exists", name))
    } else {
        Ok(())
    }
}

pub async fn list_tags_internal(pool: &SqlitePool) -> Result<Vec<EntryTag>, String> {
    sqlx::query_as(
        "SELECT id, name, color, sort_order, is_archived, created_at, updated_at
         FROM entry_tags
         ORDER BY is_archived ASC, sort_order ASC, created_at ASC",
    )
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())
}

pub async fn get_tag_by_id(pool: &SqlitePool, id: &str) -> Result<EntryTag, String> {
    sqlx::query_as(
        "SELECT id, name, color, sort_order, is_archived, created_at, updated_at
         FROM entry_tags WHERE id = ?",
    )
    .bind(id)
    .fetch_one(pool)
    .await
    .map_err(|_| "Tag not found".to_string())
}

pub async fn get_selectable_tag(pool: &SqlitePool, id: &str) -> Result<EntryTag, String> {
    let tag = get_tag_by_id(pool, id).await?;
    if tag.is_archived {
        Err(format!("Tag \"{}\" is archived", tag.name))
    } else {
        Ok(tag)
    }
}

pub async fn get_default_active_tag(pool: &SqlitePool) -> Result<EntryTag, String> {
    sqlx::query_as(
        "SELECT id, name, color, sort_order, is_archived, created_at, updated_at
         FROM entry_tags
         WHERE is_archived = 0
         ORDER BY sort_order ASC, created_at ASC
         LIMIT 1",
    )
    .fetch_one(pool)
    .await
    .map_err(|_| "No active tags available".to_string())
}

#[tauri::command]
pub async fn list_tags(pool: tauri::State<'_, SqlitePool>) -> Result<Vec<EntryTag>, String> {
    list_tags_internal(pool.inner()).await
}

#[tauri::command]
pub async fn create_tag(
    pool: tauri::State<'_, SqlitePool>,
    app: tauri::AppHandle,
    args: CreateTagArgs,
) -> Result<EntryTag, String> {
    let name = normalize_name(&args.name)?;
    ensure_unique_name(pool.inner(), &name, None).await?;

    let now = now_iso();
    let id = Uuid::new_v4().to_string();
    let next_sort_order: i64 = sqlx::query_as::<_, (i64,)>(
        "SELECT COALESCE(MAX(sort_order), -1) + 1 FROM entry_tags",
    )
    .fetch_one(pool.inner())
    .await
    .map_err(|e| e.to_string())?
    .0;
    let color = normalize_color(&args.color);

    sqlx::query(
        "INSERT INTO entry_tags (id, name, color, sort_order, is_archived, created_at, updated_at)
         VALUES (?, ?, ?, ?, 0, ?, ?)",
    )
    .bind(&id)
    .bind(&name)
    .bind(&color)
    .bind(next_sort_order)
    .bind(&now)
    .bind(&now)
    .execute(pool.inner())
    .await
    .map_err(|e| e.to_string())?;

    let tag = EntryTag {
        id,
        name,
        color,
        sort_order: next_sort_order,
        is_archived: false,
        created_at: now.clone(),
        updated_at: now,
    };

    backup::run_auto_backup_if_enabled(pool.inner(), &app, "tag-create").await;
    Ok(tag)
}

#[tauri::command]
pub async fn update_tag(
    pool: tauri::State<'_, SqlitePool>,
    app: tauri::AppHandle,
    args: UpdateTagArgs,
) -> Result<EntryTag, String> {
    let name = normalize_name(&args.name)?;
    ensure_unique_name(pool.inner(), &name, Some(&args.id)).await?;

    let current = get_tag_by_id(pool.inner(), &args.id).await?;
    let now = now_iso();
    let color = normalize_color(&args.color);

    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

    sqlx::query(
        "UPDATE entry_tags
         SET name = ?, color = ?, updated_at = ?
         WHERE id = ?",
    )
    .bind(&name)
    .bind(&color)
    .bind(&now)
    .bind(&args.id)
    .execute(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;

    if current.name != name {
        sqlx::query(
            "UPDATE time_entries
             SET entry_type = ?, updated_at = ?
             WHERE tag_id = ?",
        )
        .bind(&name)
        .bind(&now)
        .bind(&args.id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    }

    tx.commit().await.map_err(|e| e.to_string())?;

    let tag = EntryTag {
        id: args.id,
        name,
        color,
        sort_order: current.sort_order,
        is_archived: current.is_archived,
        created_at: current.created_at,
        updated_at: now,
    };

    backup::run_auto_backup_if_enabled(pool.inner(), &app, "tag-update").await;
    Ok(tag)
}

#[tauri::command]
pub async fn archive_tag(
    pool: tauri::State<'_, SqlitePool>,
    app: tauri::AppHandle,
    id: String,
) -> Result<EntryTag, String> {
    let tag = get_tag_by_id(pool.inner(), &id).await?;
    if tag.is_archived {
        return Ok(tag);
    }

    let active_count: (i64,) =
        sqlx::query_as::<_, (i64,)>("SELECT COUNT(*) FROM entry_tags WHERE is_archived = 0")
            .fetch_one(pool.inner())
            .await
            .map_err(|e| e.to_string())?;

    if active_count.0 <= 1 {
        return Err("At least one active tag is required".into());
    }

    let now = now_iso();
    sqlx::query(
        "UPDATE entry_tags SET is_archived = 1, updated_at = ? WHERE id = ?",
    )
    .bind(&now)
    .bind(&id)
    .execute(pool.inner())
    .await
    .map_err(|e| e.to_string())?;

    let archived = EntryTag {
        is_archived: true,
        updated_at: now,
        ..tag
    };

    backup::run_auto_backup_if_enabled(pool.inner(), &app, "tag-archive").await;
    Ok(archived)
}

#[tauri::command]
pub async fn unarchive_tag(
    pool: tauri::State<'_, SqlitePool>,
    app: tauri::AppHandle,
    id: String,
) -> Result<EntryTag, String> {
    let tag = get_tag_by_id(pool.inner(), &id).await?;
    if !tag.is_archived {
        return Ok(tag);
    }

    let now = now_iso();
    sqlx::query(
        "UPDATE entry_tags SET is_archived = 0, updated_at = ? WHERE id = ?",
    )
    .bind(&now)
    .bind(&id)
    .execute(pool.inner())
    .await
    .map_err(|e| e.to_string())?;

    let tag = EntryTag {
        is_archived: false,
        updated_at: now,
        ..tag
    };

    backup::run_auto_backup_if_enabled(pool.inner(), &app, "tag-unarchive").await;
    Ok(tag)
}
