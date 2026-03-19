import { useState, type ReactNode } from "react";
import { useSettings } from "../../hooks/useSettings";
import { useTags } from "../../hooks/useTags";
import { useClients } from "../../hooks/useClients";
import { exportCsv } from "../../lib/commands";
import { open } from "@tauri-apps/plugin-dialog";
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
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const resetForm = () => {
    setName("");
    setRate("75.00");
    setEditingId(null);
  };

  const handleSubmit = async () => {
    setError("");
    const rateNum = parseFloat(rate);
    if (!name.trim()) { setError("Name is required"); return; }
    if (isNaN(rateNum) || rateNum < 0) { setError("Enter a valid rate"); return; }
    try {
      if (editingId) {
        await update(editingId, name.trim(), rateNum);
      } else {
        await add(name.trim(), rateNum);
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
          <TextInput value={name} onChange={setName} placeholder="Client name" />
          <div className="flex items-center gap-1">
            <span className="text-xs text-[var(--text-muted)]">$</span>
            <input
              type="number"
              value={rate}
              onChange={(e) => setRate(e.target.value)}
              placeholder="75.00"
              className="w-20 bg-[var(--surface-1)] border border-[var(--border)] rounded px-2 py-1.5 text-sm text-[var(--text-primary)] focus:border-[var(--brand)] focus:outline-none"
            />
            <span className="text-xs text-[var(--text-muted)]">/hr</span>
          </div>
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
  const [activeSection, setActiveSection] = useState<Section>("clients");

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
                label="CSV backup path"
                description="Automatically updated after each timer stop"
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
              <Field label="Export now" description="Write CSV immediately">
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
