use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;

use crate::backup;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Settings {
    pub hourly_rate: String,
    pub currency: String,
    pub user_name: String,
    pub user_email: String,
    pub employer_name: String,
    pub backup_directory: String,
    pub auto_backup_enabled: bool,
    pub backup_csv_path: String,
    pub theme: String,
    pub invoice_notes: String,
    pub time_rounding: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DashboardData {
    pub week_hours: f64,
    pub month_hours: f64,
    pub last_month_hours: f64,
    pub ytd_hours: f64,
    pub week_earnings: f64,
    pub month_earnings: f64,
    pub last_month_earnings: f64,
    pub ytd_earnings: f64,
    pub daily_bars: Vec<DailyBar>,
    pub weekly_trend: Vec<WeeklyBar>,
    pub monthly_bars: Vec<MonthlyBar>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DailyBar {
    pub date: String,
    pub hours: f64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct WeeklyBar {
    pub week: String,
    pub hours: f64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct MonthlyBar {
    pub month: String,
    pub hours: f64,
}

async fn get_setting_value(pool: &SqlitePool, key: &str) -> String {
    sqlx::query_as::<_, (String,)>("SELECT value FROM settings WHERE key = ?")
        .bind(key)
        .fetch_optional(pool)
        .await
        .ok()
        .flatten()
        .map(|(v,)| v)
        .unwrap_or_default()
}

#[tauri::command]
pub async fn get_settings(
    pool: tauri::State<'_, SqlitePool>,
    app: tauri::AppHandle,
) -> Result<Settings, String> {
    let backup_directory = {
        let configured = get_setting_value(pool.inner(), "backup_directory").await;
        if configured.trim().is_empty() {
            crate::db::app_data_dir(&app)?
                .join("backups")
                .display()
                .to_string()
        } else {
            configured
        }
    };
    let auto_backup_enabled = !matches!(
        get_setting_value(pool.inner(), "auto_backup_enabled")
            .await
            .trim()
            .to_ascii_lowercase()
            .as_str(),
        "0" | "false" | "off"
    );

    Ok(Settings {
        hourly_rate: get_setting_value(pool.inner(), "hourly_rate").await,
        currency: get_setting_value(pool.inner(), "currency").await,
        user_name: get_setting_value(pool.inner(), "user_name").await,
        user_email: get_setting_value(pool.inner(), "user_email").await,
        employer_name: get_setting_value(pool.inner(), "employer_name").await,
        backup_directory,
        auto_backup_enabled,
        backup_csv_path: get_setting_value(pool.inner(), "backup_csv_path").await,
        theme: get_setting_value(pool.inner(), "theme").await,
        invoice_notes: get_setting_value(pool.inner(), "invoice_notes").await,
        time_rounding: get_setting_value(pool.inner(), "time_rounding").await,
    })
}

#[tauri::command]
pub async fn update_setting(
    pool: tauri::State<'_, SqlitePool>,
    app: tauri::AppHandle,
    key: String,
    value: String,
) -> Result<Settings, String> {
    let allowed = [
        "hourly_rate", "currency", "user_name", "user_email",
        "employer_name", "backup_directory", "auto_backup_enabled",
        "backup_csv_path", "theme", "invoice_notes", "time_rounding",
    ];
    if !allowed.contains(&key.as_str()) {
        return Err(format!("Unknown setting key: {}", key));
    }

    sqlx::query("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)")
        .bind(&key)
        .bind(&value)
        .execute(pool.inner())
        .await
        .map_err(|e| e.to_string())?;

    backup::run_auto_backup_if_enabled(pool.inner(), &app, "settings-update").await;
    get_settings(pool, app).await
}

#[tauri::command]
pub async fn get_dashboard_data(
    pool: tauri::State<'_, SqlitePool>,
) -> Result<DashboardData, String> {
    use chrono::{Datelike, Duration, Local};

    let today = Local::now().date_naive();
    let year = today.year();
    let month = today.month();

    // Week bounds (Mon–Sun)
    let weekday_num = today.weekday().num_days_from_monday() as i64;
    let week_start = today - Duration::days(weekday_num);
    let week_end = week_start + Duration::days(6);

    // Month bounds
    let month_start = chrono::NaiveDate::from_ymd_opt(year, month, 1).unwrap();
    let next_month = if month == 12 {
        chrono::NaiveDate::from_ymd_opt(year + 1, 1, 1).unwrap()
    } else {
        chrono::NaiveDate::from_ymd_opt(year, month + 1, 1).unwrap()
    };
    let month_end = next_month - Duration::days(1);

    // Last month
    let (last_year, last_month) = if month == 1 { (year - 1, 12) } else { (year, month - 1) };
    let last_month_start = chrono::NaiveDate::from_ymd_opt(last_year, last_month, 1).unwrap();
    let last_month_end = month_start - Duration::days(1);

    // YTD
    let ytd_start = chrono::NaiveDate::from_ymd_opt(year, 1, 1).unwrap();

    let rate_str = get_setting_value(pool.inner(), "hourly_rate").await;
    let rate: f64 = rate_str.parse().unwrap_or(75.0);

    async fn fetch_hours(pool: &SqlitePool, from: &str, to: &str) -> f64 {
        let row: Option<(Option<f64>,)> = sqlx::query_as(
            "SELECT SUM(duration_minutes) / 60.0 FROM time_entries WHERE date >= ? AND date <= ? AND end_time IS NOT NULL",
        )
        .bind(from)
        .bind(to)
        .fetch_optional(pool)
        .await
        .ok()
        .flatten();
        row.and_then(|(v,)| v).unwrap_or(0.0)
    }

    let week_hours = fetch_hours(pool.inner(), &week_start.to_string(), &week_end.to_string()).await;
    let month_hours = fetch_hours(pool.inner(), &month_start.to_string(), &month_end.to_string()).await;
    let last_month_hours = fetch_hours(pool.inner(), &last_month_start.to_string(), &last_month_end.to_string()).await;
    let ytd_hours = fetch_hours(pool.inner(), &ytd_start.to_string(), &today.to_string()).await;

    // Daily bars: current month
    let daily_rows: Vec<(String, f64)> = sqlx::query_as(
        "SELECT date, SUM(duration_minutes) / 60.0 FROM time_entries
         WHERE date >= ? AND date <= ? AND end_time IS NOT NULL
         GROUP BY date ORDER BY date ASC",
    )
    .bind(month_start.to_string())
    .bind(month_end.to_string())
    .fetch_all(pool.inner())
    .await
    .unwrap_or_default();

    let daily_bars = daily_rows
        .into_iter()
        .map(|(date, hours)| DailyBar { date, hours })
        .collect();

    // Weekly trend: last 12 weeks
    let twelve_weeks_ago = today - Duration::days(83);
    let weekly_rows: Vec<(String, f64)> = sqlx::query_as(
        "SELECT strftime('%Y-W%W', date) as week, SUM(duration_minutes) / 60.0
         FROM time_entries
         WHERE date >= ? AND end_time IS NOT NULL
         GROUP BY week ORDER BY week ASC LIMIT 12",
    )
    .bind(twelve_weeks_ago.to_string())
    .fetch_all(pool.inner())
    .await
    .unwrap_or_default();

    let weekly_trend = weekly_rows
        .into_iter()
        .map(|(week, hours)| WeeklyBar { week, hours })
        .collect();

    // Monthly bars: last 12 months
    let twelve_months_ago = today - Duration::days(365);

    let monthly_rows: Vec<(String, f64)> = sqlx::query_as(
        "SELECT strftime('%Y-%m', date) as month, SUM(duration_minutes) / 60.0
         FROM time_entries
         WHERE date >= ? AND end_time IS NOT NULL
         GROUP BY month ORDER BY month ASC LIMIT 12",
    )
    .bind(twelve_months_ago.to_string())
    .fetch_all(pool.inner())
    .await
    .unwrap_or_default();

    let monthly_bars = monthly_rows
        .into_iter()
        .map(|(month, hours)| MonthlyBar { month, hours })
        .collect();

    Ok(DashboardData {
        week_hours,
        month_hours,
        last_month_hours,
        ytd_hours,
        week_earnings: (week_hours * rate * 100.0).round() / 100.0,
        month_earnings: (month_hours * rate * 100.0).round() / 100.0,
        last_month_earnings: (last_month_hours * rate * 100.0).round() / 100.0,
        ytd_earnings: (ytd_hours * rate * 100.0).round() / 100.0,
        daily_bars,
        weekly_trend,
        monthly_bars,
    })
}
