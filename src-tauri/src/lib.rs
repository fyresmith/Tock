mod backup;
mod commands;
mod db;
mod tray;

use tauri::Manager;

use commands::{
    clients::{
        archive_client, create_client, list_clients, set_default_client, unarchive_client,
        update_client,
    },
    entries::{
        bulk_delete_entries, bulk_update_client, bulk_update_tag, create_entry, delete_entry,
        list_entries, update_entry,
    },
    invoices::{
        cancel_invoice, create_invoice, delete_invoice, get_invoice_entries, issue_invoice,
        list_invoices, mark_invoice_paid, preview_invoice, regenerate_invoice,
        revert_invoice_to_draft, save_invoice_pdf, send_invoice,
    },
    settings::{
        get_dashboard_data, get_settings, update_setting, update_settings_batch,
        update_shortcut_bindings,
    },
    tags::{archive_tag, create_tag, list_tags, unarchive_tag, update_tag},
    timer::{discard_timer, get_active_timer, start_timer, stop_timer},
};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let app_handle = app.handle().clone();
            tauri::async_runtime::block_on(async move {
                backup::apply_pending_restore(&app_handle)
                    .expect("Failed to apply pending restore");
                let pool = db::init_db(&app_handle)
                    .await
                    .expect("Failed to initialize database");
                app_handle.manage(pool);
            });
            tray::setup_tray(app)?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Timer
            start_timer,
            stop_timer,
            get_active_timer,
            discard_timer,
            // Entries
            create_entry,
            update_entry,
            delete_entry,
            list_entries,
            bulk_delete_entries,
            bulk_update_tag,
            bulk_update_client,
            // Invoices
            preview_invoice,
            create_invoice,
            list_invoices,
            regenerate_invoice,
            get_invoice_entries,
            delete_invoice,
            issue_invoice,
            revert_invoice_to_draft,
            cancel_invoice,
            save_invoice_pdf,
            send_invoice,
            mark_invoice_paid,
            // Settings & dashboard
            get_settings,
            update_setting,
            update_settings_batch,
            update_shortcut_bindings,
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
            backup::create_backup,
            backup::list_backups,
            backup::inspect_backup,
            backup::stage_restore,
            backup::restart_app,
            backup::export_csv,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
