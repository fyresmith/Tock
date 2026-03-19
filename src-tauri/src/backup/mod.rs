use csv::WriterBuilder;
use sqlx::SqlitePool;
use std::fs;
use tauri::{AppHandle, Manager};

use crate::commands::timer::{TimeEntry, TIME_ENTRY_SELECT};

pub async fn export_csv_internal(pool: &SqlitePool, app: &AppHandle) -> Result<String, String> {
    // Get configured backup path
    let path_setting: Option<(String,)> =
        sqlx::query_as("SELECT value FROM settings WHERE key = 'backup_csv_path'")
            .fetch_optional(pool)
            .await
            .ok()
            .flatten();

    let csv_path = match path_setting {
        Some((p,)) if !p.is_empty() => std::path::PathBuf::from(p),
        _ => {
            // Default: app data dir
            let data_dir = app
                .path()
                .app_data_dir()
                .map_err(|e| e.to_string())?;
            data_dir.join("tock-hours.csv")
        }
    };

    if let Some(parent) = csv_path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    let entries: Vec<TimeEntry> = sqlx::query_as(&format!(
        "SELECT {}
         FROM time_entries
         LEFT JOIN entry_tags ON time_entries.tag_id = entry_tags.id
         WHERE time_entries.end_time IS NOT NULL
         ORDER BY time_entries.date ASC, time_entries.start_time ASC",
        TIME_ENTRY_SELECT
    ))
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;

    let mut wtr = WriterBuilder::new().from_path(&csv_path).map_err(|e| e.to_string())?;

    wtr.write_record([
        "id",
        "date",
        "start_time",
        "end_time",
        "duration_minutes",
        "description",
        "tag_id",
        "tag_name",
        "tag_color",
        "invoiced",
        "invoice_id",
    ])
        .map_err(|e| e.to_string())?;

    for e in &entries {
        wtr.write_record([
            &e.id,
            &e.date,
            &e.start_time,
            &e.end_time.clone().unwrap_or_default(),
            &e.duration_minutes.map(|d| d.to_string()).unwrap_or_default(),
            &e.description,
            &e.tag_id.clone().unwrap_or_default(),
            &e.tag_name,
            &e.tag_color,
            &(if e.invoiced { "1" } else { "0" }).to_string(),
            &e.invoice_id.clone().unwrap_or_default(),
        ])
        .map_err(|e| e.to_string())?;
    }

    wtr.flush().map_err(|e| e.to_string())?;

    Ok(csv_path.display().to_string())
}

#[tauri::command]
pub async fn export_csv(
    pool: tauri::State<'_, SqlitePool>,
    app: tauri::AppHandle,
) -> Result<String, String> {
    export_csv_internal(pool.inner(), &app).await
}
