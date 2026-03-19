import { useEffect, useState, type ReactNode } from "react";
import { useSettings } from "../../hooks/useSettings";
import { useTags } from "../../hooks/useTags";
import { useClients } from "../../hooks/useClients";
import {
  BackupSummary,
  createBackup,
  exportCsv,
  inspectBackup,
  listBackups,
  restartApp,
  stageRestore,
} from "../../lib/commands";
import { confirm, open } from "@tauri-apps/plugin-dialog";
import { openPath } from "@tauri-apps/plugin-opener";
import { TagBadge } from "../tags/TagBadge";
import {
  Briefcase,
  Database,
  DollarSign,
  Palette,
  Tags,
  User,
  type LucideIcon,
} from "lucide-react";

function Field({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1 py-3 border-b border-[var(--border)] last:border-0">
      <p className="text-sm font-medium text-[var(--text-primary)]">{label}</p>
      {description && <p className="text-xs text-[var(--text-muted)]">{description}</p>}
      <div className="pt-0.5">{children}</div>
    </div>
  );
}

function formatBackupTimestamp(value: string): string {
  const [date, time = ""] = value.split("T");
  return `${date}${time ? ` ${time}` : ""}`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function TextInput({
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded px-3 py-1.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--brand)] focus:outline-none"
    />
  );
}

function TagManager() {
  const { tags, add, update, archive, unarchive } = useTags();
  const [name, setName] = useState("");
  const [color, setColor] = useState("#64748b");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const resetForm = () => {
    setName("");
    setColor("#64748b");
    setEditingId(null);
  };

  const handleSubmit = async () => {
    setError("");
    try {
      if (editingId) {
        await update(editingId, name, color);
      } else {
        await add(name, color);
      }
      resetForm();
    } catch (e) {
      setError(String(e));
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded border border-[var(--border)] bg-[var(--surface-2)] p-3 space-y-2.5">
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <TextInput value={name} onChange={setName} placeholder="Tag name" />
          <input
            type="color"
            value={color}
            onChange={(event) => setColor(event.target.value)}
            className="h-8 w-10 rounded border border-[var(--border)] bg-[var(--surface-1)]"
          />
        </div>
        {error && <p className="text-xs text-[var(--danger)]">{error}</p>}
        <div className="flex gap-2">
          <button
            onClick={handleSubmit}
            className="px-3 py-1.5 rounded bg-[var(--brand)] hover:bg-[var(--brand-hover)] text-white text-xs font-medium transition-colors"
          >
            {editingId ? "Save Tag" : "Add Tag"}
          </button>
          {editingId && (
            <button
              onClick={resetForm}
              className="px-3 py-1.5 rounded text-xs text-[var(--text-secondary)] hover:bg-[var(--surface-3)] transition-colors"
            >
              Cancel
            </button>
          )}
        </div>
      </div>

      <div className="space-y-1">
        {tags.map((tag) => (
          <div
            key={tag.id}
            className="flex items-center justify-between gap-3 rounded border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2"
          >
            <div className="min-w-0">
              <TagBadge
                tag={tag}
                className={`text-xs ${tag.is_archived ? "text-[var(--text-muted)]" : "text-[var(--text-primary)]"}`}
              />
              {tag.is_archived && (
                <p className="mt-0.5 text-[10px] text-[var(--text-muted)]">Archived</p>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => {
                  setEditingId(tag.id);
                  setName(tag.name);
                  setColor(tag.color);
                }}
                className="px-2 py-1 rounded text-xs text-[var(--text-secondary)] hover:bg-[var(--surface-3)] transition-colors"
              >
                Edit
              </button>
              {tag.is_archived ? (
                <button
                  onClick={() => unarchive(tag.id)}
                  className="px-2 py-1 rounded text-xs text-[var(--brand)] hover:bg-[var(--brand)]/10 transition-colors"
                >
                  Restore
                </button>
              ) : (
                <button
                  onClick={() => archive(tag.id)}
                  className="px-2 py-1 rounded text-xs text-[var(--warning)] hover:bg-[var(--warning)]/10 transition-colors"
                >
                  Archive
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ClientManager() {
  const { clients, add, update, setDefault, archive, unarchive } = useClients();
  const [name, setName] = useState("");
  const [rate, setRate] = useState("75.00");
  const [billingName, setBillingName] = useState("");
  const [billingEmail, setBillingEmail] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const resetForm = () => {
    setName("");
    setRate("75.00");
    setBillingName("");
    setBillingEmail("");
    setEditingId(null);
  };

  const handleSubmit = async () => {
    setError("");
    const rateNum = parseFloat(rate);
    if (!name.trim()) { setError("Name is required"); return; }
    if (isNaN(rateNum) || rateNum < 0) { setError("Enter a valid rate"); return; }
    try {
      if (editingId) {
        await update(
          editingId,
          name.trim(),
          rateNum,
          billingName.trim() || null,
          billingEmail.trim() || null
        );
      } else {
        await add(
          name.trim(),
          rateNum,
          billingName.trim() || null,
          billingEmail.trim() || null
        );
      }
      resetForm();
    } catch (e) {
      setError(String(e));
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded border border-[var(--border)] bg-[var(--surface-2)] p-3 space-y-2.5">
        <div className="grid gap-2">
          <TextInput value={name} onChange={setName} placeholder="Client name" />
          <div className="grid grid-cols-[auto_1fr_auto] items-center gap-2">
            <span className="text-xs text-[var(--text-muted)]">$</span>
            <input
              type="number"
              value={rate}
              onChange={(e) => setRate(e.target.value)}
              placeholder="75.00"
              className="w-full bg-[var(--surface-1)] border border-[var(--border)] rounded px-2 py-1.5 text-sm text-[var(--text-primary)] focus:border-[var(--brand)] focus:outline-none"
            />
            <span className="text-xs text-[var(--text-muted)]">/hr</span>
          </div>
          <TextInput
            value={billingName}
            onChange={setBillingName}
            placeholder="Billing name (optional)"
          />
          <TextInput
            type="email"
            value={billingEmail}
            onChange={setBillingEmail}
            placeholder="billing@client.com (optional)"
          />
        </div>
        {error && <p className="text-xs text-[var(--danger)]">{error}</p>}
        <div className="flex gap-2">
          <button
            onClick={handleSubmit}
            className="px-3 py-1.5 rounded bg-[var(--brand)] hover:bg-[var(--brand-hover)] text-white text-xs font-medium transition-colors"
          >
            {editingId ? "Save Client" : "Add Client"}
          </button>
          {editingId && (
            <button
              onClick={resetForm}
              className="px-3 py-1.5 rounded text-xs text-[var(--text-secondary)] hover:bg-[var(--surface-3)] transition-colors"
            >
              Cancel
            </button>
          )}
        </div>
      </div>

      <div className="space-y-1">
        {clients.map((client) => (
          <div
            key={client.id}
            className="flex items-center justify-between gap-3 rounded border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className={`text-xs font-medium ${client.is_archived ? "text-[var(--text-muted)]" : "text-[var(--text-primary)]"}`}>
                  {client.name}
                </span>
                {client.is_default && !client.is_archived && (
                  <span className="text-[10px] text-[var(--brand)]">default</span>
                )}
              </div>
              <p className="text-[11px] text-[var(--text-muted)]">
                ${client.hourly_rate.toFixed(2)}/hr
                {client.is_archived && " · Archived"}
              </p>
              {(client.billing_name || client.billing_email) && (
                <p className="text-[11px] text-[var(--text-muted)]">
                  Billing: {client.billing_name || client.name}
                  {client.billing_email ? ` · ${client.billing_email}` : ""}
                </p>
              )}
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              {!client.is_archived && !client.is_default && (
                <button
                  onClick={() => setDefault(client.id)}
                  className="px-2 py-1 rounded text-xs text-[var(--text-secondary)] hover:bg-[var(--surface-3)] transition-colors"
                >
                  Set default
                </button>
              )}
              <button
                onClick={() => {
                  setEditingId(client.id);
                  setName(client.name);
                  setRate(client.hourly_rate.toFixed(2));
                  setBillingName(client.billing_name ?? "");
                  setBillingEmail(client.billing_email ?? "");
                }}
                className="px-2 py-1 rounded text-xs text-[var(--text-secondary)] hover:bg-[var(--surface-3)] transition-colors"
              >
                Edit
              </button>
              {client.is_archived ? (
                <button
                  onClick={() => unarchive(client.id)}
                  className="px-2 py-1 rounded text-xs text-[var(--brand)] hover:bg-[var(--brand)]/10 transition-colors"
                >
                  Restore
                </button>
              ) : (
                <button
                  onClick={() => archive(client.id)}
                  className="px-2 py-1 rounded text-xs text-[var(--warning)] hover:bg-[var(--warning)]/10 transition-colors"
                >
                  Archive
                </button>
              )}
            </div>
          </div>
        ))}
        {clients.length === 0 && (
          <p className="text-xs text-[var(--text-muted)] py-2">No clients yet. Add one above.</p>
        )}
      </div>
    </div>
  );
}

type Section = "clients" | "billing" | "identity" | "appearance" | "tags" | "data";

const NAV_ITEMS: { id: Section; label: string; icon: LucideIcon }[] = [
  { id: "clients", label: "Clients", icon: Briefcase },
  { id: "billing", label: "Billing", icon: DollarSign },
  { id: "identity", label: "Identity", icon: User },
  { id: "appearance", label: "Appearance", icon: Palette },
  { id: "tags", label: "Tags", icon: Tags },
  { id: "data", label: "Data", icon: Database },
];

export function SettingsView() {
  const { settings, loading, update } = useSettings();
  const [csvStatus, setCsvStatus] = useState("");
  const [backupStatus, setBackupStatus] = useState<{ tone: "muted" | "danger"; message: string } | null>(null);
  const [backups, setBackups] = useState<BackupSummary[]>([]);
  const [backupsLoading, setBackupsLoading] = useState(false);
  const [activeSection, setActiveSection] = useState<Section>("clients");

  const loadBackups = async () => {
    try {
      setBackupsLoading(true);
      setBackups(await listBackups());
    } catch (e) {
      setBackupStatus({ tone: "danger", message: `Unable to load backups: ${e}` });
    } finally {
      setBackupsLoading(false);
    }
  };

  useEffect(() => {
    if (activeSection === "data") {
      loadBackups().catch(console.error);
    }
  }, [activeSection]);

  if (loading || !settings) {
    return (
      <div className="flex-1 flex items-center justify-center text-[var(--text-muted)]">
        Loading settings…
      </div>
    );
  }

  const handleUpdate = async (key: string, value: string) => {
    await update(key, value);
  };

  const handleExportNow = async () => {
    try {
      const path = await exportCsv();
      setCsvStatus(`Exported to ${path}`);
    } catch (e) {
      setCsvStatus(`Error: ${e}`);
    }
  };

  const handlePickCsvPath = async () => {
    try {
      const path = await open({
        directory: true,
        title: "Select backup folder",
      });
      if (typeof path === "string") {
        await handleUpdate("backup_csv_path", `${path}/tock-hours.csv`);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handlePickBackupDirectory = async () => {
    try {
      const path = await open({
        directory: true,
        title: "Select backup folder",
      });
      if (typeof path === "string") {
        await handleUpdate("backup_directory", path);
        setBackupStatus({ tone: "muted", message: `Backups will be stored in ${path}` });
        await loadBackups();
      }
    } catch (e) {
      setBackupStatus({ tone: "danger", message: `Unable to set backup folder: ${e}` });
    }
  };

  const handleCreateBackupNow = async () => {
    try {
      const summary = await createBackup("manual");
      setBackupStatus({ tone: "muted", message: `Backup created at ${summary.path}` });
      await loadBackups();
    } catch (e) {
      setBackupStatus({ tone: "danger", message: `Backup failed: ${e}` });
    }
  };

  const handleRestoreBackup = async () => {
    try {
      const selected = await open({
        title: "Select backup file",
        filters: [{ name: "Tock Backup", extensions: ["zip"] }],
      });
      if (typeof selected !== "string") return;

      const inspection = await inspectBackup(selected);
      const counts = inspection.table_counts
        .map((count) => `${count.table}: ${count.rows}`)
        .join("\n");
      const warningLine = inspection.warnings.length
        ? `\n\nWarnings:\n${inspection.warnings.join("\n")}`
        : "";

      const shouldRestore = await confirm(
        `Restore ${inspection.summary.file_name} from ${formatBackupTimestamp(inspection.summary.created_at)}?\n\nThis creates a safety backup of your current data, stages the restore, and restarts Tock.\n\n${counts}${warningLine}`,
        {
          title: "Restore Backup",
          kind: "warning",
        }
      );

      if (!shouldRestore) return;

      const result = await stageRestore(selected);
      setBackupStatus({
        tone: "muted",
        message: `Restore staged. Safety backup saved to ${result.safety_backup_path}. Restarting…`,
      });
      restartApp();
    } catch (e) {
      setBackupStatus({ tone: "danger", message: `Restore failed: ${e}` });
    }
  };

  const handleOpenBackupFolder = async () => {
    try {
      await openPath(settings.backup_directory);
    } catch (e) {
      setBackupStatus({ tone: "danger", message: `Unable to open backup folder: ${e}` });
    }
  };

  const ActiveIcon = NAV_ITEMS.find((item) => item.id === activeSection)?.icon ?? DollarSign;

  return (
    <div className="flex-1 flex overflow-hidden">
      <nav className="w-40 flex-shrink-0 border-r border-[var(--border)] bg-[var(--surface-1)] px-2 py-3 space-y-px">
        {NAV_ITEMS.map(({ id, label, icon: Icon }) => {
          const active = activeSection === id;
          return (
            <button
              key={id}
              onClick={() => setActiveSection(id)}
              className={`relative w-full flex items-center gap-2.5 px-3 py-1.5 rounded text-[13px] font-medium text-left transition-colors ${
                active
                  ? "bg-[var(--surface-3)] text-[var(--text-primary)]"
                  : "text-[var(--text-secondary)] hover:bg-[var(--surface-2)] hover:text-[var(--text-primary)]"
              }`}
            >
              {active && (
                <span className="absolute left-0 top-1 bottom-1 w-0.5 rounded-sm bg-[var(--brand)]" />
              )}
              <Icon size={13} strokeWidth={active ? 2 : 1.75} />
              {label}
            </button>
          );
        })}
      </nav>

      <div className="flex-1 overflow-auto">
        <div className="px-5 py-4 max-w-lg">
          <div className="flex items-center gap-2 mb-4 pb-2.5 border-b border-[var(--border)]">
            <ActiveIcon size={14} className="text-[var(--text-muted)]" strokeWidth={1.75} />
            <h2 className="text-[13px] font-semibold text-[var(--text-primary)]">
              {NAV_ITEMS.find((item) => item.id === activeSection)?.label}
            </h2>
          </div>

          {activeSection === "clients" && <ClientManager />}

          {activeSection === "billing" && (
            <div>
              <Field label="Hourly rate" description="Used for invoice calculations">
                <TextInput
                  type="number"
                  value={settings.hourly_rate}
                  onChange={(value) => handleUpdate("hourly_rate", value)}
                  placeholder="75.00"
                />
              </Field>
              <Field label="Currency" description="ISO currency code">
                <select
                  value={settings.currency}
                  onChange={(event) => handleUpdate("currency", event.target.value)}
                  className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded px-3 py-1.5 text-sm text-[var(--text-primary)] focus:border-[var(--brand)] focus:outline-none"
                >
                  <option value="USD">USD — US Dollar</option>
                  <option value="EUR">EUR — Euro</option>
                  <option value="GBP">GBP — British Pound</option>
                  <option value="CAD">CAD — Canadian Dollar</option>
                  <option value="AUD">AUD — Australian Dollar</option>
                </select>
              </Field>
              <Field
                label="Time rounding (invoices)"
                description="Applied only when generating invoices, not stored on entries."
              >
                <select
                  value={settings.time_rounding}
                  onChange={(event) => handleUpdate("time_rounding", event.target.value)}
                  className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded px-3 py-1.5 text-sm text-[var(--text-primary)] focus:border-[var(--brand)] focus:outline-none"
                >
                  <option value="none">No rounding</option>
                  <option value="15">Round up to 15 min</option>
                  <option value="30">Round up to 30 min</option>
                  <option value="60">Round up to 1 hr</option>
                </select>
              </Field>
              <Field label="Invoice notes" description="Footer text on generated invoices">
                <textarea
                  value={settings.invoice_notes}
                  onChange={(event) => handleUpdate("invoice_notes", event.target.value)}
                  rows={3}
                  className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded px-3 py-1.5 text-sm text-[var(--text-primary)] resize-none focus:border-[var(--brand)] focus:outline-none"
                />
              </Field>
            </div>
          )}

          {activeSection === "identity" && (
            <div>
              <Field label="Your name">
                <TextInput
                  value={settings.user_name}
                  onChange={(value) => handleUpdate("user_name", value)}
                  placeholder="Jane Smith"
                />
              </Field>
              <Field label="Your email">
                <TextInput
                  type="email"
                  value={settings.user_email}
                  onChange={(value) => handleUpdate("user_email", value)}
                  placeholder="jane@example.com"
                />
              </Field>
              <Field label="Employer / Client name">
                <TextInput
                  value={settings.employer_name}
                  onChange={(value) => handleUpdate("employer_name", value)}
                  placeholder="Acme Corp"
                />
              </Field>
            </div>
          )}

          {activeSection === "appearance" && (
            <div>
              <Field label="Theme">
                <select
                  value={settings.theme}
                  onChange={(event) => {
                    handleUpdate("theme", event.target.value);
                    document.documentElement.classList.toggle("light", event.target.value === "light");
                  }}
                  className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded px-3 py-1.5 text-sm text-[var(--text-primary)] focus:border-[var(--brand)] focus:outline-none"
                >
                  <option value="dark">Dark</option>
                  <option value="light">Light</option>
                </select>
              </Field>
            </div>
          )}

          {activeSection === "tags" && <TagManager />}

          {activeSection === "data" && (
            <div>
              <Field
                label="Backup folder"
                description="Full app backups are stored here automatically and when you create one manually."
              >
                <div className="flex items-center gap-2">
                  <span className="text-xs text-[var(--text-muted)] truncate flex-1">
                    {settings.backup_directory}
                  </span>
                  <button
                    onClick={handlePickBackupDirectory}
                    className="px-3 py-1.5 rounded text-xs bg-[var(--surface-2)] border border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--surface-3)] transition-colors flex-shrink-0"
                  >
                    Browse…
                  </button>
                </div>
              </Field>
              <Field label="Automatic backups" description="Create rolling local backups after every successful data change.">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => handleUpdate("auto_backup_enabled", settings.auto_backup_enabled ? "0" : "1")}
                    className="px-3 py-1.5 rounded text-sm bg-[var(--surface-2)] border border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--surface-3)] transition-colors"
                  >
                    {settings.auto_backup_enabled ? "Enabled" : "Disabled"}
                  </button>
                </div>
              </Field>
              <Field label="Backup actions" description="Create a full backup, restore one, or open the backup folder.">
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={handleCreateBackupNow}
                    className="px-3 py-1.5 rounded text-sm bg-[var(--brand)] hover:bg-[var(--brand-hover)] text-white transition-colors"
                  >
                    Create Backup Now
                  </button>
                  <button
                    onClick={handleRestoreBackup}
                    className="px-3 py-1.5 rounded text-sm bg-[var(--surface-2)] border border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--surface-3)] transition-colors"
                  >
                    Restore Backup…
                  </button>
                  <button
                    onClick={handleOpenBackupFolder}
                    className="px-3 py-1.5 rounded text-sm bg-[var(--surface-2)] border border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--surface-3)] transition-colors"
                  >
                    Open Backup Folder
                  </button>
                </div>
                {backupStatus && (
                  <p className={`text-xs ${backupStatus.tone === "danger" ? "text-[var(--danger)]" : "text-[var(--text-muted)]"}`}>
                    {backupStatus.message}
                  </p>
                )}
              </Field>
              <Field label="Recent backups" description="Newest full-snapshot backups in your configured backup folder.">
                {backupsLoading ? (
                  <p className="text-xs text-[var(--text-muted)]">Loading backups…</p>
                ) : backups.length === 0 ? (
                  <p className="text-xs text-[var(--text-muted)]">No backups yet.</p>
                ) : (
                  <div className="space-y-2">
                    {backups.slice(0, 8).map((backup) => (
                      <div
                        key={backup.path}
                        className="rounded border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-xs text-[var(--text-secondary)]"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <span className="font-medium text-[var(--text-primary)]">{backup.file_name}</span>
                          <span className="uppercase tracking-[0.16em] text-[10px] text-[var(--text-muted)]">
                            {backup.kind}
                          </span>
                        </div>
                        <div className="mt-1 flex items-center justify-between gap-3">
                          <span>{formatBackupTimestamp(backup.created_at)}</span>
                          <span>{formatBytes(backup.size_bytes)}</span>
                        </div>
                        {backup.warnings_count > 0 && (
                          <p className="mt-1 text-[var(--warning)]">
                            {backup.warnings_count} warning{backup.warnings_count === 1 ? "" : "s"}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </Field>
              <Field
                label="CSV export path"
                description="Separate timesheet export location. CSV is no longer the primary backup format."
              >
                <div className="flex items-center gap-2">
                  <span className="text-xs text-[var(--text-muted)] truncate flex-1">
                    {settings.backup_csv_path || "Default (app data)"}
                  </span>
                  <button
                    onClick={handlePickCsvPath}
                    className="px-3 py-1.5 rounded text-xs bg-[var(--surface-2)] border border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--surface-3)] transition-colors flex-shrink-0"
                  >
                    Browse…
                  </button>
                </div>
              </Field>
              <Field label="CSV export now" description="Write the time-entry CSV immediately.">
                <div className="flex items-center gap-3">
                  <button
                    onClick={handleExportNow}
                    className="px-3 py-1.5 rounded text-sm bg-[var(--surface-2)] border border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--surface-3)] transition-colors"
                  >
                    Export CSV
                  </button>
                  {csvStatus && (
                    <span className="text-xs text-[var(--text-muted)] truncate">
                      {csvStatus}
                    </span>
                  )}
                </div>
              </Field>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
