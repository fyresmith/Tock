use chrono::{Datelike, Duration, Local, NaiveDate};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};
use std::collections::BTreeMap;

use crate::backup;

const SHORTCUT_BINDINGS_KEY: &str = "shortcut_bindings";
const ACTION_OPEN_COMMAND_PALETTE: &str = "open-command-palette";
const ACTION_TOGGLE_TIMER: &str = "toggle-timer";
const ACTION_OPEN_MANUAL_ENTRY: &str = "open-manual-entry";
const ACTION_GO_TO_TIMER: &str = "go-to-timer";
const ACTION_GO_TO_LOG: &str = "go-to-log";
const ACTION_GO_TO_DASHBOARD: &str = "go-to-dashboard";
const ACTION_GO_TO_INVOICES: &str = "go-to-invoices";
const ACTION_GO_TO_SETTINGS: &str = "go-to-settings";
const ACTION_OPEN_SHORTCUTS_SETTINGS: &str = "open-shortcuts-settings";

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
    pub shortcut_bindings: BTreeMap<String, String>,
    pub command_palette_shortcut: String,
    pub quick_add_entry_shortcut: String,
    pub stop_timer_shortcut: String,
}

#[derive(Debug, Deserialize)]
pub struct SettingChange {
    pub key: String,
    pub value: String,
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
    pub unpaid_amount: f64,
    pub overdue_amount: f64,
    pub due_soon_amount: f64,
    pub open_invoice_count: i64,
    pub overdue_invoice_count: i64,
    pub due_soon_invoice_count: i64,
    pub daily_bars: Vec<DailyBar>,
    pub weekly_trend: Vec<WeeklyBar>,
    pub monthly_bars: Vec<MonthlyBar>,
    pub client_receivables: Vec<ClientReceivable>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DailyBar {
    pub date: String,
    pub hours: f64,
    pub earnings: f64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct WeeklyBar {
    pub week: String,
    pub hours: f64,
    pub earnings: f64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct MonthlyBar {
    pub month: String,
    pub hours: f64,
    pub earnings: f64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ClientReceivable {
    pub client_name: String,
    pub open_amount: f64,
    pub overdue_amount: f64,
    pub invoice_count: i64,
    pub overdue_count: i64,
    pub next_due_at: Option<String>,
}

#[derive(Debug, Default, Clone, Copy)]
struct Totals {
    hours: f64,
    earnings: f64,
}

#[derive(Debug, FromRow)]
struct DashboardEntryRow {
    date: String,
    duration_minutes: Option<i64>,
    billable: bool,
    hourly_rate: Option<f64>,
    client_hourly_rate: Option<f64>,
}

#[derive(Debug, FromRow)]
struct ClientReceivableRow {
    client_name: String,
    open_amount: f64,
    overdue_amount: f64,
    invoice_count: i64,
    overdue_count: i64,
    next_due_at: Option<String>,
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

fn round_currency(value: f64) -> f64 {
    (value * 100.0).round() / 100.0
}

fn apply_rounding(minutes: i64, rounding: &str) -> i64 {
    match rounding {
        "15" => ((minutes + 14) / 15) * 15,
        "30" => ((minutes + 29) / 30) * 30,
        "60" => ((minutes + 59) / 60) * 60,
        _ => minutes,
    }
}

fn resolve_entry_rate(
    entry_rate: Option<f64>,
    client_rate: Option<f64>,
    default_rate: f64,
) -> f64 {
    entry_rate.or(client_rate).unwrap_or(default_rate)
}

fn billed_totals(row: &DashboardEntryRow, default_rate: f64, rounding: &str) -> Totals {
    if !row.billable {
        return Totals::default();
    }

    let rounded_minutes = apply_rounding(row.duration_minutes.unwrap_or(0), rounding);
    let hours = rounded_minutes as f64 / 60.0;
    let rate = resolve_entry_rate(row.hourly_rate, row.client_hourly_rate, default_rate);

    Totals {
        hours,
        earnings: round_currency(hours * rate),
    }
}

fn add_totals(target: &mut Totals, value: Totals) {
    target.hours += value.hours;
    target.earnings += value.earnings;
}

fn finalize_totals(totals: Totals) -> Totals {
    Totals {
        hours: round_currency(totals.hours),
        earnings: round_currency(totals.earnings),
    }
}

fn iso_week_key(date: NaiveDate) -> String {
    let iso_week = date.iso_week();
    format!("{:04}-W{:02}", iso_week.year(), iso_week.week())
}

fn month_key(date: NaiveDate) -> String {
    format!("{:04}-{:02}", date.year(), date.month())
}

fn known_shortcut_action_ids() -> [&'static str; 9] {
    [
        ACTION_OPEN_COMMAND_PALETTE,
        ACTION_TOGGLE_TIMER,
        ACTION_OPEN_MANUAL_ENTRY,
        ACTION_GO_TO_TIMER,
        ACTION_GO_TO_LOG,
        ACTION_GO_TO_DASHBOARD,
        ACTION_GO_TO_INVOICES,
        ACTION_GO_TO_SETTINGS,
        ACTION_OPEN_SHORTCUTS_SETTINGS,
    ]
}

fn default_shortcut_bindings() -> BTreeMap<String, String> {
    BTreeMap::from([
        (ACTION_OPEN_COMMAND_PALETTE.to_string(), "mod+k".to_string()),
        (ACTION_TOGGLE_TIMER.to_string(), "space".to_string()),
        (
            ACTION_OPEN_MANUAL_ENTRY.to_string(),
            "mod+shift+n".to_string(),
        ),
        (ACTION_GO_TO_TIMER.to_string(), "mod+1".to_string()),
        (ACTION_GO_TO_LOG.to_string(), "mod+2".to_string()),
        (ACTION_GO_TO_DASHBOARD.to_string(), "mod+3".to_string()),
        (ACTION_GO_TO_INVOICES.to_string(), "mod+4".to_string()),
        (ACTION_GO_TO_SETTINGS.to_string(), "mod+5".to_string()),
    ])
}

fn sanitize_shortcut_bindings(bindings: BTreeMap<String, String>) -> BTreeMap<String, String> {
    let allowed = known_shortcut_action_ids();
    bindings
        .into_iter()
        .filter_map(|(action_id, shortcut)| {
            if !allowed.contains(&action_id.as_str()) {
                return None;
            }

            let trimmed = shortcut.trim();
            if trimmed.is_empty() {
                return None;
            }

            Some((action_id, trimmed.to_string()))
        })
        .collect()
}

async fn persist_shortcut_bindings(
    pool: &SqlitePool,
    bindings: &BTreeMap<String, String>,
) -> Result<(), String> {
    let serialized = serde_json::to_string(bindings).map_err(|e| e.to_string())?;
    sqlx::query("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)")
        .bind(SHORTCUT_BINDINGS_KEY)
        .bind(serialized)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

async fn migrated_shortcut_bindings(pool: &SqlitePool) -> BTreeMap<String, String> {
    let mut bindings = default_shortcut_bindings();

    let legacy_overrides = [
        ("command_palette_shortcut", ACTION_OPEN_COMMAND_PALETTE),
        ("quick_add_entry_shortcut", ACTION_OPEN_MANUAL_ENTRY),
    ];

    for (legacy_key, action_id) in legacy_overrides {
        let value = get_setting_value(pool, legacy_key).await;
        let trimmed = value.trim();
        if !trimmed.is_empty() {
            bindings.insert(action_id.to_string(), trimmed.to_string());
        }
    }

    bindings
}

async fn ensure_shortcut_bindings(pool: &SqlitePool) -> Result<BTreeMap<String, String>, String> {
    let raw = get_setting_value(pool, SHORTCUT_BINDINGS_KEY).await;

    if !raw.trim().is_empty() {
        if let Ok(parsed) = serde_json::from_str::<BTreeMap<String, String>>(&raw) {
            let sanitized = sanitize_shortcut_bindings(parsed.clone());
            if !sanitized.is_empty() {
                if sanitized != parsed {
                    persist_shortcut_bindings(pool, &sanitized).await?;
                }
                return Ok(sanitized);
            }
        }
    }

    let migrated = migrated_shortcut_bindings(pool).await;
    persist_shortcut_bindings(pool, &migrated).await?;
    Ok(migrated)
}

fn allowed_setting_keys() -> [&'static str; 15] {
    [
        "hourly_rate",
        "currency",
        "user_name",
        "user_email",
        "employer_name",
        "backup_directory",
        "auto_backup_enabled",
        "backup_csv_path",
        "theme",
        "invoice_notes",
        "time_rounding",
        "shortcut_bindings",
        "command_palette_shortcut",
        "quick_add_entry_shortcut",
        "stop_timer_shortcut",
    ]
}

#[tauri::command]
pub async fn get_settings(
    pool: tauri::State<'_, SqlitePool>,
    app: tauri::AppHandle,
) -> Result<Settings, String> {
    let shortcut_bindings = ensure_shortcut_bindings(pool.inner()).await?;
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
        shortcut_bindings,
        command_palette_shortcut: get_setting_value(pool.inner(), "command_palette_shortcut").await,
        quick_add_entry_shortcut: get_setting_value(pool.inner(), "quick_add_entry_shortcut").await,
        stop_timer_shortcut: get_setting_value(pool.inner(), "stop_timer_shortcut").await,
    })
}

#[tauri::command]
pub async fn update_setting(
    pool: tauri::State<'_, SqlitePool>,
    app: tauri::AppHandle,
    key: String,
    value: String,
) -> Result<Settings, String> {
    let allowed = allowed_setting_keys();
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
pub async fn update_settings_batch(
    pool: tauri::State<'_, SqlitePool>,
    app: tauri::AppHandle,
    changes: Vec<SettingChange>,
) -> Result<Settings, String> {
    if changes.is_empty() {
        return get_settings(pool, app).await;
    }

    let allowed = allowed_setting_keys();
    for change in &changes {
        if !allowed.contains(&change.key.as_str()) {
            return Err(format!("Unknown setting key: {}", change.key));
        }
    }

    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;
    for change in &changes {
        sqlx::query("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)")
            .bind(&change.key)
            .bind(&change.value)
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;
    }
    tx.commit().await.map_err(|e| e.to_string())?;

    backup::run_auto_backup_if_enabled(pool.inner(), &app, "settings-update-batch").await;
    get_settings(pool, app).await
}

#[tauri::command]
pub async fn update_shortcut_bindings(
    pool: tauri::State<'_, SqlitePool>,
    app: tauri::AppHandle,
    bindings: BTreeMap<String, String>,
) -> Result<Settings, String> {
    let sanitized = sanitize_shortcut_bindings(bindings);
    persist_shortcut_bindings(pool.inner(), &sanitized).await?;

    backup::run_auto_backup_if_enabled(pool.inner(), &app, "settings-update-shortcuts").await;
    get_settings(pool, app).await
}

#[tauri::command]
pub async fn get_dashboard_data(
    pool: tauri::State<'_, SqlitePool>,
) -> Result<DashboardData, String> {
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
    let default_rate: f64 = get_setting_value(pool.inner(), "hourly_rate")
        .await
        .parse()
        .unwrap_or(75.0);
    let rounding = get_setting_value(pool.inner(), "time_rounding").await;
    let rounding = if rounding.trim().is_empty() {
        "none".to_string()
    } else {
        rounding
    };

    let twelve_weeks_ago = week_start - Duration::weeks(11);
    let twelve_months_ago = month_start - Duration::days(365);
    let analysis_start = if twelve_months_ago < ytd_start {
        twelve_months_ago
    } else {
        ytd_start
    };

    let entry_rows: Vec<DashboardEntryRow> = sqlx::query_as(
        "SELECT
            time_entries.date,
            time_entries.duration_minutes,
            COALESCE(time_entries.billable, 1) AS billable,
            time_entries.hourly_rate,
            clients.hourly_rate AS client_hourly_rate
         FROM time_entries
         LEFT JOIN clients ON time_entries.client_id = clients.id
         WHERE time_entries.end_time IS NOT NULL
           AND time_entries.date >= ?
           AND time_entries.date <= ?
         ORDER BY time_entries.date ASC",
    )
    .bind(analysis_start.to_string())
    .bind(month_end.to_string())
    .fetch_all(pool.inner())
    .await
    .map_err(|e| e.to_string())?;

    let mut week_totals = Totals::default();
    let mut month_totals = Totals::default();
    let mut last_month_totals = Totals::default();
    let mut ytd_totals = Totals::default();
    let mut daily_map: BTreeMap<String, Totals> = BTreeMap::new();
    let mut weekly_map: BTreeMap<String, Totals> = BTreeMap::new();
    let mut monthly_map: BTreeMap<String, Totals> = BTreeMap::new();

    for row in &entry_rows {
        let entry_date =
            NaiveDate::parse_from_str(&row.date, "%Y-%m-%d").map_err(|e| e.to_string())?;
        let entry_totals = billed_totals(row, default_rate, &rounding);

        if entry_date >= week_start && entry_date <= week_end {
            add_totals(&mut week_totals, entry_totals);
        }
        if entry_date >= month_start && entry_date <= month_end {
            add_totals(&mut month_totals, entry_totals);
            add_totals(
                daily_map.entry(row.date.clone()).or_default(),
                entry_totals,
            );
        }
        if entry_date >= last_month_start && entry_date <= last_month_end {
            add_totals(&mut last_month_totals, entry_totals);
        }
        if entry_date >= ytd_start && entry_date <= today {
            add_totals(&mut ytd_totals, entry_totals);
        }
        if entry_date >= twelve_weeks_ago && entry_date <= today {
            add_totals(
                weekly_map.entry(iso_week_key(entry_date)).or_default(),
                entry_totals,
            );
        }
        if entry_date >= twelve_months_ago && entry_date <= today {
            add_totals(
                monthly_map.entry(month_key(entry_date)).or_default(),
                entry_totals,
            );
        }
    }

    let daily_bars = daily_map
        .into_iter()
        .map(|(date, totals)| {
            let totals = finalize_totals(totals);
            DailyBar {
                date,
                hours: totals.hours,
                earnings: totals.earnings,
            }
        })
        .collect();

    let mut weekly_trend: Vec<WeeklyBar> = weekly_map
        .into_iter()
        .map(|(week, totals)| {
            let totals = finalize_totals(totals);
            WeeklyBar {
                week,
                hours: totals.hours,
                earnings: totals.earnings,
            }
        })
        .collect();
    if weekly_trend.len() > 12 {
        weekly_trend = weekly_trend.split_off(weekly_trend.len() - 12);
    }

    let mut monthly_bars: Vec<MonthlyBar> = monthly_map
        .into_iter()
        .map(|(month, totals)| {
            let totals = finalize_totals(totals);
            MonthlyBar {
                month,
                hours: totals.hours,
                earnings: totals.earnings,
            }
        })
        .collect();
    if monthly_bars.len() > 12 {
        monthly_bars = monthly_bars.split_off(monthly_bars.len() - 12);
    }

    let due_soon_end = today + Duration::days(7);
    let receivables_row: (f64, f64, f64, i64, i64, i64) = sqlx::query_as(
        "SELECT
            COALESCE(SUM(total_amount), 0.0) AS unpaid_amount,
            COALESCE(SUM(CASE WHEN due_at IS NOT NULL AND due_at < ? THEN total_amount ELSE 0.0 END), 0.0) AS overdue_amount,
            COALESCE(SUM(CASE WHEN due_at IS NOT NULL AND due_at >= ? AND due_at <= ? THEN total_amount ELSE 0.0 END), 0.0) AS due_soon_amount,
            COUNT(*) AS open_invoice_count,
            COALESCE(SUM(CASE WHEN due_at IS NOT NULL AND due_at < ? THEN 1 ELSE 0 END), 0) AS overdue_invoice_count,
            COALESCE(SUM(CASE WHEN due_at IS NOT NULL AND due_at >= ? AND due_at <= ? THEN 1 ELSE 0 END), 0) AS due_soon_invoice_count
         FROM invoices
         WHERE status IN ('issued', 'sent')
           AND paid_at IS NULL",
    )
    .bind(today.to_string())
    .bind(today.to_string())
    .bind(due_soon_end.to_string())
    .bind(today.to_string())
    .bind(today.to_string())
    .bind(due_soon_end.to_string())
    .fetch_one(pool.inner())
    .await
    .map_err(|e| e.to_string())?;

    let client_receivables = sqlx::query_as::<_, ClientReceivableRow>(
        "SELECT
            COALESCE(NULLIF(TRIM(client_name), ''), 'Unassigned') AS client_name,
            COALESCE(SUM(total_amount), 0.0) AS open_amount,
            COALESCE(SUM(CASE WHEN due_at IS NOT NULL AND due_at < ? THEN total_amount ELSE 0.0 END), 0.0) AS overdue_amount,
            COUNT(*) AS invoice_count,
            COALESCE(SUM(CASE WHEN due_at IS NOT NULL AND due_at < ? THEN 1 ELSE 0 END), 0) AS overdue_count,
            MIN(CASE WHEN due_at IS NOT NULL THEN due_at END) AS next_due_at
         FROM invoices
         WHERE status IN ('issued', 'sent')
           AND paid_at IS NULL
         GROUP BY COALESCE(NULLIF(TRIM(client_name), ''), 'Unassigned')
         ORDER BY overdue_amount DESC, open_amount DESC, client_name ASC
         LIMIT 6",
    )
    .bind(today.to_string())
    .bind(today.to_string())
    .fetch_all(pool.inner())
    .await
    .map_err(|e| e.to_string())?
    .into_iter()
    .map(|row| ClientReceivable {
        client_name: row.client_name,
        open_amount: round_currency(row.open_amount),
        overdue_amount: round_currency(row.overdue_amount),
        invoice_count: row.invoice_count,
        overdue_count: row.overdue_count,
        next_due_at: row.next_due_at,
    })
    .collect();

    let week_totals = finalize_totals(week_totals);
    let month_totals = finalize_totals(month_totals);
    let last_month_totals = finalize_totals(last_month_totals);
    let ytd_totals = finalize_totals(ytd_totals);

    Ok(DashboardData {
        week_hours: week_totals.hours,
        month_hours: month_totals.hours,
        last_month_hours: last_month_totals.hours,
        ytd_hours: ytd_totals.hours,
        week_earnings: week_totals.earnings,
        month_earnings: month_totals.earnings,
        last_month_earnings: last_month_totals.earnings,
        ytd_earnings: ytd_totals.earnings,
        unpaid_amount: round_currency(receivables_row.0),
        overdue_amount: round_currency(receivables_row.1),
        due_soon_amount: round_currency(receivables_row.2),
        open_invoice_count: receivables_row.3,
        overdue_invoice_count: receivables_row.4,
        due_soon_invoice_count: receivables_row.5,
        daily_bars,
        weekly_trend,
        monthly_bars,
        client_receivables,
    })
}
