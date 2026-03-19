mod backup;
mod commands;
mod db;

use tauri::Manager;

use commands::{
    clients::{
        archive_client, create_client, list_clients, set_default_client, unarchive_client,
        update_client,
    },
    entries::{create_entry, delete_entry, list_entries, update_entry},
    invoices::{
        create_invoice, delete_invoice, get_invoice_entries, issue_invoice, list_invoices,
        mark_invoice_paid, preview_invoice, regenerate_invoice, revert_invoice_to_draft,
        send_invoice,
    },
    settings::{get_dashboard_data, get_settings, update_setting},
    tags::{archive_tag, create_tag, list_tags, unarchive_tag, update_tag},
    timer::{discard_timer, get_active_timer, open_timer_popup, start_timer, stop_timer},
};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let app_handle = app.handle().clone();
            tauri::async_runtime::block_on(async move {
                let pool = db::init_db(&app_handle)
                    .await
                    .expect("Failed to initialize database");
                app_handle.manage(pool);
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Timer
            start_timer,
            stop_timer,
            get_active_timer,
            discard_timer,
            open_timer_popup,
            // Entries
            create_entry,
            update_entry,
            delete_entry,
            list_entries,
            // Invoices
            preview_invoice,
            create_invoice,
            list_invoices,
            regenerate_invoice,
            get_invoice_entries,
            delete_invoice,
            issue_invoice,
            revert_invoice_to_draft,
            send_invoice,
            mark_invoice_paid,
            // Settings & dashboard
            get_settings,
            update_setting,
            get_dashboard_data,
            // Tags
            list_tags,
            create_tag,
            update_tag,
            archive_tag,
            unarchive_tag,
            // Clients
            list_clients,
            create_client,
            update_client,
            set_default_client,
            archive_client,
            unarchive_client,
            // Backup
            backup::export_csv,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
