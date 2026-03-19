import { invoke } from "@tauri-apps/api/core";

export interface Client {
  id: string;
  name: string;
  hourly_rate: number;
  billing_name: string | null;
  billing_email: string | null;
  is_default: boolean;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
}

export interface TimeEntry {
  id: string;
  date: string;
  start_time: string;
  end_time: string | null;
  duration_minutes: number | null;
  description: string;
  entry_type: string;
  tag_id: string | null;
  tag_name: string;
  tag_color: string;
  invoiced: boolean;
  invoice_id: string | null;
  client_id: string | null;
  created_at: string;
  updated_at: string;
  billable: boolean;
  hourly_rate: number | null;
}

export interface EntryTag {
  id: string;
  name: string;
  color: string;
  sort_order: number;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
}

export type InvoiceFormat = "detailed" | "weekly" | "daily" | "simple" | "type-breakdown";
export type InvoiceStatus = "draft" | "issued" | "sent" | "paid";

export interface Invoice {
  id: string;
  invoice_number: string;
  period_start: string;
  period_end: string;
  total_hours: number;
  hourly_rate: number;
  total_amount: number;
  status: InvoiceStatus;
  pdf_path: string | null;
  created_at: string;
  issued_at: string | null;
  sent_at: string | null;
  due_at: string | null;
  paid_at: string | null;
  locked_at: string | null;
  format: InvoiceFormat;
  layout_data: string | null;
  name: string | null;
  client_id: string | null;
  client_name: string | null;
  is_overdue: boolean;
  is_locked: boolean;
}

export interface InvoiceWithEntries {
  invoice: Invoice;
  entries: TimeEntry[];
}

export interface InvoicePreview {
  invoice_number: string | null;
  period_start: string;
  period_end: string;
  total_hours: number;
  hourly_rate: number;
  total_amount: number;
  format: InvoiceFormat;
  layout_data: string | null;
  name: string | null;
  client_id: string | null;
  client_name: string | null;
  issued_at: string;
  entries: TimeEntry[];
}

export interface Settings {
  hourly_rate: string;
  currency: string;
  user_name: string;
  user_email: string;
  employer_name: string;
  backup_directory: string;
  auto_backup_enabled: boolean;
  backup_csv_path: string;
  theme: string;
  invoice_notes: string;
  time_rounding: string;
}

export type BackupKind = "auto" | "manual" | "safety";

export interface TableCount {
  table: string;
  rows: number;
}

export interface BackupPdfEntry {
  invoice_id: string;
  original_path: string;
  archive_path: string | null;
  file_name: string | null;
  status: string;
  sha256: string | null;
  size_bytes: number | null;
}

export interface BackupSummary {
  backup_version: number;
  app_version: string;
  created_at: string;
  kind: BackupKind;
  reason: string | null;
  path: string;
  file_name: string;
  size_bytes: number;
  warnings_count: number;
}

export interface BackupInspection {
  summary: BackupSummary;
  table_counts: TableCount[];
  warnings: string[];
  pdfs: BackupPdfEntry[];
}

export interface RestoreSummary {
  backup: BackupSummary;
  safety_backup_path: string;
  warnings: string[];
  restart_required: boolean;
}

export interface DailyBar {
  date: string;
  hours: number;
}

export interface WeeklyBar {
  week: string;
  hours: number;
}

export interface MonthlyBar {
  month: string;
  hours: number;
}

export interface DashboardData {
  week_hours: number;
  month_hours: number;
  last_month_hours: number;
  ytd_hours: number;
  week_earnings: number;
  month_earnings: number;
  last_month_earnings: number;
  ytd_earnings: number;
  daily_bars: DailyBar[];
  weekly_trend: WeeklyBar[];
  monthly_bars: MonthlyBar[];
}

// ── Timer ──────────────────────────────────────────────────────────
export const startTimer = (clientId: string | null = null) =>
  invoke<TimeEntry>("start_timer", { clientId });

export const stopTimer = (entryId: string, description: string, tagId: string) =>
  invoke<TimeEntry>("stop_timer", { entryId, description, tagId });

export const getActiveTimer = () => invoke<TimeEntry | null>("get_active_timer");

export const discardTimer = (entryId: string) =>
  invoke<void>("discard_timer", { entryId });

export const openTimerPopup = () => invoke<void>("open_timer_popup");

// ── Entries ────────────────────────────────────────────────────────
export interface CreateEntryArgs {
  date: string;
  start_time: string;
  end_time: string;
  description: string;
  tag_id: string;
  client_id?: string | null;
  billable?: boolean;
  hourly_rate?: number | null;
}

export interface UpdateEntryArgs {
  id: string;
  date?: string;
  start_time?: string;
  end_time?: string;
  duration_minutes?: number;
  description?: string;
  tag_id?: string;
  billable?: boolean;
  hourly_rate?: number | null;
}

export interface ListEntriesArgs {
  date_from?: string;
  date_to?: string;
  search?: string;
  tag_id?: string;
  invoiced?: boolean;
  billable?: boolean;
}

export const createEntry = (args: CreateEntryArgs) =>
  invoke<TimeEntry>("create_entry", { args });

export const updateEntry = (args: UpdateEntryArgs) =>
  invoke<TimeEntry>("update_entry", { args });

export const deleteEntry = (id: string) => invoke<void>("delete_entry", { id });

export const listEntries = (args: ListEntriesArgs = {}) =>
  invoke<TimeEntry[]>("list_entries", { args });

export const bulkDeleteEntries = (ids: string[]) =>
  invoke<void>("bulk_delete_entries", { ids });

export const bulkUpdateTag = (ids: string[], tagId: string) =>
  invoke<void>("bulk_update_tag", { ids, tagId });

// ── Invoices ───────────────────────────────────────────────────────
export const previewInvoice = (
  periodStart: string,
  periodEnd: string,
  format: InvoiceFormat = "detailed",
  layoutData: string | null = null,
  name: string | null = null,
  clientId: string | null = null
) =>
  invoke<InvoicePreview>("preview_invoice", {
    periodStart,
    periodEnd,
    format,
    layoutData,
    name,
    clientId,
  });

export const createInvoice = (
  periodStart: string,
  periodEnd: string,
  entryIds: string[],
  format: InvoiceFormat = "detailed",
  layoutData: string | null = null,
  name: string | null = null,
  clientId: string | null = null
) =>
  invoke<InvoiceWithEntries>("create_invoice", {
    periodStart,
    periodEnd,
    entryIds,
    format,
    layoutData,
    name,
    clientId,
  });

export const listInvoices = () => invoke<Invoice[]>("list_invoices");

export const regenerateInvoice = (invoiceId: string) =>
  invoke<InvoiceWithEntries>("regenerate_invoice", { invoiceId });

export const issueInvoice = (invoiceId: string, issuedAt: string, dueAt: string) =>
  invoke<Invoice>("issue_invoice", { invoiceId, issuedAt, dueAt });

export const revertInvoiceToDraft = (invoiceId: string) =>
  invoke<Invoice>("revert_invoice_to_draft", { invoiceId });

export const cancelInvoice = (invoiceId: string) =>
  invoke<Invoice>("cancel_invoice", { invoiceId });

export const sendInvoice = (invoiceId: string, sentAt: string) =>
  invoke<Invoice>("send_invoice", { invoiceId, sentAt });

export const markInvoicePaid = (invoiceId: string, paidAt: string) =>
  invoke<Invoice>("mark_invoice_paid", { invoiceId, paidAt });

export const getInvoiceEntries = (invoiceId: string) =>
  invoke<TimeEntry[]>("get_invoice_entries", { invoiceId });

export const saveInvoicePdf = (invoiceId: string, path: string, bytes: number[]) =>
  invoke<Invoice>("save_invoice_pdf", { invoiceId, path, bytes });

export const deleteInvoice = (invoiceId: string) =>
  invoke<void>("delete_invoice", { invoiceId });

// ── Settings ───────────────────────────────────────────────────────
export const getSettings = () => invoke<Settings>("get_settings");

export const updateSetting = (key: string, value: string) =>
  invoke<Settings>("update_setting", { key, value });

export const exportCsv = () => invoke<string>("export_csv");

export const createBackup = (
  kind: Extract<BackupKind, "auto" | "manual">,
  reason: string | null = null
) => invoke<BackupSummary>("create_backup", { kind, reason });

export const listBackups = () => invoke<BackupSummary[]>("list_backups");

export const inspectBackup = (path: string) =>
  invoke<BackupInspection>("inspect_backup", { path });

export const stageRestore = (path: string) =>
  invoke<RestoreSummary>("stage_restore", { path });

export const restartApp = () => invoke<void>("restart_app");

export const getDashboardData = () => invoke<DashboardData>("get_dashboard_data");

// ── Tags ───────────────────────────────────────────────────────────
export const listTags = () => invoke<EntryTag[]>("list_tags");

export const createTag = (name: string, color: string) =>
  invoke<EntryTag>("create_tag", { args: { name, color } });

export const updateTag = (id: string, name: string, color: string) =>
  invoke<EntryTag>("update_tag", { args: { id, name, color } });

export const archiveTag = (id: string) =>
  invoke<EntryTag>("archive_tag", { id });

export const unarchiveTag = (id: string) =>
  invoke<EntryTag>("unarchive_tag", { id });

// ── Clients ────────────────────────────────────────────────────────
export const listClients = () => invoke<Client[]>("list_clients");

export const createClient = (
  name: string,
  hourlyRate: number,
  billingName: string | null = null,
  billingEmail: string | null = null
) =>
  invoke<Client>("create_client", {
    args: {
      name,
      hourly_rate: hourlyRate,
      billing_name: billingName,
      billing_email: billingEmail,
    },
  });

export const updateClient = (
  id: string,
  name: string,
  hourlyRate: number,
  billingName: string | null = null,
  billingEmail: string | null = null
) =>
  invoke<Client>("update_client", {
    args: {
      id,
      name,
      hourly_rate: hourlyRate,
      billing_name: billingName,
      billing_email: billingEmail,
    },
  });

export const setDefaultClient = (id: string) =>
  invoke<Client>("set_default_client", { id });

export const archiveClient = (id: string) =>
  invoke<Client>("archive_client", { id });

export const unarchiveClient = (id: string) =>
  invoke<Client>("unarchive_client", { id });
