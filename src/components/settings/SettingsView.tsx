import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useSettings } from "../../hooks/useSettings";
import { useTags } from "../../hooks/useTags";
import { useClients } from "../../hooks/useClients";
import {
  type BackupSummary,
  type Client,
  type EntryTag,
  type Settings,
  createBackup,
  exportCsv,
  inspectBackup,
  listBackups,
  restartApp,
  stageRestore,
} from "../../lib/commands";
import { type SettingsSection } from "../../lib/navigation";
import {
  formatShortcut,
  isSpaceShortcut,
  shortcutHasModifier,
  normalizeShortcut,
  shortcutFromEvent,
} from "../../lib/shortcuts";
import {
  SHORTCUT_DEFINITIONS,
  createShortcutDraft,
  normalizeShortcutBindings,
  type ShortcutActionId,
} from "../../lib/shortcutRegistry";
import { formatCurrency } from "../../lib/dateUtils";
import { confirm, open } from "@tauri-apps/plugin-dialog";
import { openPath } from "@tauri-apps/plugin-opener";
import { TagBadge } from "../tags/TagBadge";
import { Select } from "../ui/Select";
import {
  Briefcase,
  Database,
  DollarSign,
  Keyboard,
  Palette,
  Tags,
  User,
  type LucideIcon,
} from "lucide-react";
type StatusTone = "muted" | "success" | "danger" | "warning";

type StatusMessageState = {
  tone: StatusTone;
  message: string;
} | null;

const NAV_ITEMS: Array<{
  id: SettingsSection;
  label: string;
  icon: LucideIcon;
  eyebrow: string;
  description: string;
}> = [
  {
    id: "clients",
    label: "Clients",
    icon: Briefcase,
    eyebrow: "Relationships",
    description: "Manage who you bill, their default rate, and the contact details used for invoices.",
  },
  {
    id: "billing",
    label: "Billing",
    icon: DollarSign,
    eyebrow: "Defaults",
    description: "Set invoice defaults like rate, currency, rounding, and the notes you append to every PDF.",
  },
  {
    id: "identity",
    label: "Identity",
    icon: User,
    eyebrow: "Profile",
    description: "Control the sender details and legacy fallback recipient shown on invoices when no client is attached.",
  },
  {
    id: "appearance",
    label: "Appearance",
    icon: Palette,
    eyebrow: "Chrome",
    description: "Choose how the desktop app looks without affecting the appearance of exported invoices.",
  },
  {
    id: "shortcuts",
    label: "Shortcuts",
    icon: Keyboard,
    eyebrow: "Command Palette",
    description: "Customize the key bindings for navigation, timer controls, manual entry, and the command palette.",
  },
  {
    id: "tags",
    label: "Tags",
    icon: Tags,
    eyebrow: "Organization",
    description: "Shape the labels and colors you use to classify time so the rest of the app stays easy to scan.",
  },
  {
    id: "data",
    label: "Data",
    icon: Database,
    eyebrow: "Backups",
    description: "Back up, restore, and export your data from one place.",
  },
];

const CURRENCY_OPTIONS = [
  { value: "USD", label: "USD — US Dollar" },
  { value: "EUR", label: "EUR — Euro" },
  { value: "GBP", label: "GBP — British Pound" },
  { value: "CAD", label: "CAD — Canadian Dollar" },
  { value: "AUD", label: "AUD — Australian Dollar" },
];

const ROUNDING_OPTIONS = [
  { value: "none", label: "No rounding" },
  { value: "15", label: "Round up to 15 min" },
  { value: "30", label: "Round up to 30 min" },
  { value: "60", label: "Round up to 1 hr" },
];

const TAG_COLOR_PRESETS = [
  "#6e68b8",
  "#22c55e",
  "#f59e0b",
  "#ef4444",
  "#06b6d4",
  "#3b82f6",
  "#c084fc",
  "#64748b",
];

function formatBackupTimestamp(value: string): string {
  const [date, time = ""] = value.split("T");
  return `${date}${time ? ` ${time}` : ""}`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatRoundingLabel(value: string): string {
  return ROUNDING_OPTIONS.find((option) => option.value === value)?.label ?? "No rounding";
}

function applyThemePreview(theme: Settings["theme"]) {
  document.documentElement.classList.toggle("light", theme === "light");
}

function toneClass(tone: StatusTone): string {
  switch (tone) {
    case "success":
      return "text-[var(--success)] bg-[var(--success)]/10 border-[var(--success)]/20";
    case "danger":
      return "text-[var(--danger)] bg-[var(--danger)]/10 border-[var(--danger)]/20";
    case "warning":
      return "text-[var(--warning)] bg-[var(--warning)]/10 border-[var(--warning)]/20";
    default:
      return "text-[var(--text-secondary)] bg-[var(--surface-2)] border-[var(--border)]";
  }
}

function buttonClass(kind: "primary" | "secondary" | "ghost" = "secondary"): string {
  if (kind === "primary") {
    return "px-3 py-2 rounded bg-[var(--brand)] hover:bg-[var(--brand-hover)] text-white text-sm font-medium transition-colors";
  }
  if (kind === "ghost") {
    return "px-3 py-2 rounded text-sm text-[var(--text-secondary)] hover:bg-[var(--surface-3)] transition-colors";
  }
  return "px-3 py-2 rounded bg-[var(--surface-2)] border border-[var(--border)] text-sm text-[var(--text-secondary)] hover:bg-[var(--surface-3)] transition-colors";
}

function SettingsPageHeader({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div className="mb-5 pb-4 border-b border-[var(--border)]">
      <p className="text-[10px] font-semibold tracking-[0.18em] uppercase text-[var(--text-muted)]">
        {eyebrow}
      </p>
      <h2 className="mt-1 text-[18px] font-semibold text-[var(--text-primary)]">{title}</h2>
      <p className="mt-1.5 max-w-2xl text-sm text-[var(--text-secondary)]">{description}</p>
    </div>
  );
}

function SettingsSectionCard({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded border border-[var(--border)] bg-[var(--surface-1)] p-4 shadow-[0_1px_0_rgba(255,255,255,0.02)]">
      <div className="mb-4">
        <h3 className="text-[13px] font-semibold text-[var(--text-primary)]">{title}</h3>
        {description && <p className="mt-1 text-xs text-[var(--text-muted)]">{description}</p>}
      </div>
      {children}
    </section>
  );
}

function SettingsField({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div>
        <p className="text-[12px] font-medium text-[var(--text-primary)]">{label}</p>
        {description && <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">{description}</p>}
      </div>
      {children}
    </div>
  );
}

function SettingsStatusMessage({ status }: { status: StatusMessageState }) {
  if (!status) return null;
  return (
    <div className={`rounded border px-3 py-2 text-xs ${toneClass(status.tone)}`}>
      {status.message}
    </div>
  );
}

function SettingsActionBar({
  dirty,
  saving,
  saveDisabled,
  status,
  onSave,
  onReset,
}: {
  dirty: boolean;
  saving?: boolean;
  saveDisabled?: boolean;
  status: StatusMessageState;
  onSave: () => Promise<void> | void;
  onReset: () => void;
}) {
  if (!dirty && !status) return null;
  return (
    <div className="rounded border border-[var(--border)] bg-[var(--surface-1)] px-4 py-3">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="min-h-[20px]">
          <SettingsStatusMessage status={status} />
          {!status && dirty && (
            <p className="text-xs text-[var(--text-muted)]">You have unsaved changes in this tab.</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={onReset} className={buttonClass("secondary")}>
            Reset
          </button>
          <button
            onClick={onSave}
            disabled={!dirty || saving || saveDisabled}
            className={`${buttonClass("primary")} disabled:opacity-50`}
          >
            {saving ? "Saving…" : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

function SettingsEmptyState({
  title,
  message,
}: {
  title: string;
  message: string;
}) {
  return (
    <div className="rounded border border-dashed border-[var(--border-strong)] bg-[var(--surface-2)] px-4 py-5 text-center">
      <p className="text-sm font-medium text-[var(--text-primary)]">{title}</p>
      <p className="mt-1 text-xs text-[var(--text-muted)]">{message}</p>
    </div>
  );
}

function SettingsStat({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2.5">
      <p className="text-[9px] font-semibold tracking-[0.18em] uppercase text-[var(--text-muted)]">
        {label}
      </p>
      <p className="mt-1 text-sm font-semibold text-[var(--text-primary)]">{value}</p>
    </div>
  );
}

function SettingsPill({
  label,
  tone = "muted",
}: {
  label: string;
  tone?: "muted" | "brand" | "warning";
}) {
  const className =
    tone === "brand"
      ? "text-[var(--brand)] bg-[var(--brand)]/10 border-[var(--brand)]/20"
      : tone === "warning"
        ? "text-[var(--warning)] bg-[var(--warning)]/10 border-[var(--warning)]/20"
        : "text-[var(--text-secondary)] bg-[var(--surface-2)] border-[var(--border)]";
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${className}`}>
      {label}
    </span>
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
      className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--brand)] focus:outline-none"
    />
  );
}

function SelectInput({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <Select
      value={value}
      onChange={onChange}
      options={options}
      className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-sm text-[var(--text-primary)] focus:border-[var(--brand)] focus:outline-none"
    />
  );
}

function ShortcutCaptureButton({
  value,
  listening,
  isMac,
  onChange,
  onStartListening,
  onStopListening,
}: {
  value: string;
  listening: boolean;
  isMac: boolean;
  onChange: (value: string) => void;
  onStartListening: () => void;
  onStopListening: () => void;
}) {
  return (
    <button
      type="button"
      data-shortcut-recorder="true"
      aria-pressed={listening}
      onClick={onStartListening}
      onBlur={() => {
        if (listening) {
          onStopListening();
        }
      }}
      onKeyDown={(event) => {
        if (!listening) {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onStartListening();
          }
          return;
        }

        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          onStopListening();
          return;
        }

        if (event.key === "Tab") {
          onStopListening();
          return;
        }

        if (event.key === "Backspace" || event.key === "Delete") {
          event.preventDefault();
          event.stopPropagation();
          onChange("");
          onStopListening();
          return;
        }

        const shortcut = shortcutFromEvent(event.nativeEvent, isMac);
        if (!shortcut) {
          return;
        }

        event.preventDefault();
        event.stopPropagation();
        onChange(shortcut);
        onStopListening();
      }}
      className={`inline-flex min-w-[11rem] items-center justify-between rounded-md border px-2.5 py-1.5 text-left transition-colors ${
        listening
          ? "border-[var(--brand)] bg-[var(--brand-muted)]"
          : "border-[var(--border)] bg-[var(--surface-2)] hover:border-[var(--border-strong)]"
      }`}
    >
      <span className="truncate text-[13px] font-medium text-[var(--text-primary)]">
        {listening ? "Press shortcut…" : formatShortcut(value, isMac)}
      </span>
      <span className="ml-3 shrink-0 text-[10px] uppercase tracking-[0.14em] text-[var(--text-muted)]">
        {listening ? "Recording" : "Record"}
      </span>
    </button>
  );
}

type ShortcutDraftState = Record<ShortcutActionId, string>;

function getShortcutDraftFromSettings(settings: Settings): ShortcutDraftState {
  return createShortcutDraft(normalizeShortcutBindings(settings.shortcut_bindings));
}

function getShortcutValidationErrors(draft: ShortcutDraftState): Partial<Record<ShortcutActionId, string>> {
  const errors: Partial<Record<ShortcutActionId, string>> = {};
  const actionsByShortcut = new Map<string, ShortcutActionId[]>();

  for (const definition of SHORTCUT_DEFINITIONS) {
    const shortcut = normalizeShortcut(draft[definition.id]);
    if (!shortcut) continue;

    const hasModifier = shortcutHasModifier(shortcut);
    if (!hasModifier) {
      if (definition.allowModifierless && isSpaceShortcut(shortcut)) {
        // Space is the single allowed modifierless shortcut.
      } else if (isSpaceShortcut(shortcut)) {
        errors[definition.id] = "Space is reserved for the timer toggle shortcut.";
        continue;
      } else {
        errors[definition.id] = definition.allowModifierless
          ? "Only Space can be modifierless for this action."
          : "This shortcut needs at least one modifier key.";
        continue;
      }
    }

    if (!definition.allowModifierless && isSpaceShortcut(shortcut)) {
      errors[definition.id] = "Space is reserved for the timer toggle shortcut.";
      continue;
    }

    const actionIds = actionsByShortcut.get(shortcut) ?? [];
    actionIds.push(definition.id);
    actionsByShortcut.set(shortcut, actionIds);
  }

  for (const actionIds of actionsByShortcut.values()) {
    if (actionIds.length < 2) continue;
    for (const actionId of actionIds) {
      const otherTitles = actionIds
        .filter((id) => id !== actionId)
        .map((id) => SHORTCUT_DEFINITIONS.find((definition) => definition.id === id)?.title ?? id)
        .join(", ");
      errors[actionId] = `Already assigned to ${otherTitles}.`;
    }
  }

  return errors;
}

function BillingSettingsSection({
  settings,
  updateMany,
}: {
  settings: Settings;
  updateMany: (changes: Array<{ key: string; value: string }>) => Promise<Settings>;
}) {
  const [draft, setDraft] = useState({
    hourly_rate: settings.hourly_rate,
    currency: settings.currency,
    time_rounding: settings.time_rounding,
    invoice_notes: settings.invoice_notes,
  });
  const [status, setStatus] = useState<StatusMessageState>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraft({
      hourly_rate: settings.hourly_rate,
      currency: settings.currency,
      time_rounding: settings.time_rounding,
      invoice_notes: settings.invoice_notes,
    });
  }, [settings.hourly_rate, settings.currency, settings.time_rounding, settings.invoice_notes]);

  const dirty =
    draft.hourly_rate !== settings.hourly_rate ||
    draft.currency !== settings.currency ||
    draft.time_rounding !== settings.time_rounding ||
    draft.invoice_notes !== settings.invoice_notes;

  const parsedRate = Number.parseFloat(draft.hourly_rate);
  const isValid = Number.isFinite(parsedRate) && parsedRate >= 0;

  const save = async () => {
    if (!isValid) {
      setStatus({ tone: "danger", message: "Enter a valid default hourly rate before saving." });
      return;
    }
    setSaving(true);
    try {
      await updateMany([
        { key: "hourly_rate", value: draft.hourly_rate },
        { key: "currency", value: draft.currency },
        { key: "time_rounding", value: draft.time_rounding },
        { key: "invoice_notes", value: draft.invoice_notes },
      ]);
      setStatus({ tone: "success", message: "Billing defaults updated." });
    } catch (e) {
      setStatus({ tone: "danger", message: `Unable to save billing settings: ${e}` });
    } finally {
      setSaving(false);
    }
  };

  const reset = () => {
    setDraft({
      hourly_rate: settings.hourly_rate,
      currency: settings.currency,
      time_rounding: settings.time_rounding,
      invoice_notes: settings.invoice_notes,
    });
    setStatus(null);
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-3">
        <SettingsStat
          label="Default Rate"
          value={isValid ? formatCurrency(parsedRate, draft.currency) : "Invalid rate"}
        />
        <SettingsStat label="Currency" value={draft.currency} />
        <SettingsStat label="Rounding" value={formatRoundingLabel(draft.time_rounding)} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <SettingsSectionCard
          title="Invoice Defaults"
          description="These values seed new invoices unless a client or entry overrides them."
        >
          <div className="grid gap-4 md:grid-cols-2">
            <SettingsField label="Hourly rate" description="Used as the fallback invoice rate.">
              <div className="grid grid-cols-[auto_1fr_auto] items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3">
                <span className="text-xs text-[var(--text-muted)]">$</span>
                <input
                  type="number"
                  value={draft.hourly_rate}
                  onChange={(event) => {
                    setDraft((current) => ({ ...current, hourly_rate: event.target.value }));
                    setStatus(null);
                  }}
                  placeholder="75.00"
                  className="w-full bg-transparent py-2 text-sm text-[var(--text-primary)] focus:outline-none"
                />
                <span className="text-xs text-[var(--text-muted)]">/hr</span>
              </div>
            </SettingsField>

            <SettingsField label="Currency" description="Displayed in invoices and summaries.">
              <SelectInput
                value={draft.currency}
                onChange={(value) => {
                  setDraft((current) => ({ ...current, currency: value }));
                  setStatus(null);
                }}
                options={CURRENCY_OPTIONS}
              />
            </SettingsField>

            <SettingsField
              label="Time rounding"
              description="Applied during invoice generation only, not to stored entries."
            >
              <SelectInput
                value={draft.time_rounding}
                onChange={(value) => {
                  setDraft((current) => ({ ...current, time_rounding: value }));
                  setStatus(null);
                }}
                options={ROUNDING_OPTIONS}
              />
            </SettingsField>
          </div>
        </SettingsSectionCard>

        <SettingsSectionCard
          title="Invoice Notes"
          description="Footer text appended to generated invoice PDFs."
        >
          <div className="space-y-4">
            <SettingsField label="Notes" description="Keep this short and reusable across invoices.">
              <textarea
                value={draft.invoice_notes}
                onChange={(event) => {
                  setDraft((current) => ({ ...current, invoice_notes: event.target.value }));
                  setStatus(null);
                }}
                rows={6}
                className="w-full resize-none rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--brand)] focus:outline-none"
              />
            </SettingsField>

            <div className="rounded border border-[var(--border)] bg-[var(--surface-2)] p-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--text-muted)]">
                Footer Preview
              </p>
              <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
                {draft.invoice_notes.trim() || "No footer notes yet."}
              </p>
            </div>
          </div>
        </SettingsSectionCard>
      </div>

      <SettingsActionBar
        dirty={dirty}
        saving={saving}
        saveDisabled={!isValid}
        status={status}
        onSave={save}
        onReset={reset}
      />
    </div>
  );
}

function IdentitySettingsSection({
  settings,
  updateMany,
}: {
  settings: Settings;
  updateMany: (changes: Array<{ key: string; value: string }>) => Promise<Settings>;
}) {
  const [draft, setDraft] = useState({
    user_name: settings.user_name,
    user_email: settings.user_email,
    employer_name: settings.employer_name,
  });
  const [status, setStatus] = useState<StatusMessageState>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraft({
      user_name: settings.user_name,
      user_email: settings.user_email,
      employer_name: settings.employer_name,
    });
  }, [settings.user_name, settings.user_email, settings.employer_name]);

  const dirty =
    draft.user_name !== settings.user_name ||
    draft.user_email !== settings.user_email ||
    draft.employer_name !== settings.employer_name;

  const emailValid =
    draft.user_email.trim() === "" ||
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.user_email.trim());

  const save = async () => {
    if (!emailValid) {
      setStatus({ tone: "danger", message: "Enter a valid email address before saving." });
      return;
    }
    setSaving(true);
    try {
      await updateMany([
        { key: "user_name", value: draft.user_name },
        { key: "user_email", value: draft.user_email },
        { key: "employer_name", value: draft.employer_name },
      ]);
      setStatus({ tone: "success", message: "Identity settings updated." });
    } catch (e) {
      setStatus({ tone: "danger", message: `Unable to save identity settings: ${e}` });
    } finally {
      setSaving(false);
    }
  };

  const reset = () => {
    setDraft({
      user_name: settings.user_name,
      user_email: settings.user_email,
      employer_name: settings.employer_name,
    });
    setStatus(null);
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,0.95fr)]">
        <div className="space-y-4">
          <SettingsSectionCard
            title="Your Details"
            description="Used in the sender block of invoice PDFs and Gmail helper drafts."
          >
            <div className="grid gap-4">
              <SettingsField label="Your name" description="Appears as the invoice sender name.">
                <TextInput
                  value={draft.user_name}
                  onChange={(value) => {
                    setDraft((current) => ({ ...current, user_name: value }));
                    setStatus(null);
                  }}
                  placeholder="Jane Smith"
                />
              </SettingsField>

              <SettingsField label="Your email" description="Used in invoice contact details and Gmail drafts.">
                <TextInput
                  type="email"
                  value={draft.user_email}
                  onChange={(value) => {
                    setDraft((current) => ({ ...current, user_email: value }));
                    setStatus(null);
                  }}
                  placeholder="jane@example.com"
                />
                {!emailValid && (
                  <p className="text-xs text-[var(--danger)]">Enter a valid email address.</p>
                )}
              </SettingsField>
            </div>
          </SettingsSectionCard>

          <SettingsSectionCard
            title="Invoice Fallback"
            description="Only used when an invoice has no client-specific billing contact."
          >
            <SettingsField
              label="Fallback client name"
              description="Legacy billed-to name for no-client invoices and older data."
            >
              <TextInput
                value={draft.employer_name}
                onChange={(value) => {
                  setDraft((current) => ({ ...current, employer_name: value }));
                  setStatus(null);
                }}
                placeholder="Acme Corp"
              />
            </SettingsField>
          </SettingsSectionCard>
        </div>

        <SettingsSectionCard
          title="Invoice Header Preview"
          description="A compact preview of how sender and fallback recipient blocks will read."
        >
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-1">
            <div className="rounded border border-[var(--border)] bg-[var(--surface-2)] p-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--text-muted)]">
                From
              </p>
              <p className="mt-2 text-sm font-medium text-[var(--text-primary)]">
                {draft.user_name.trim() || "Your Name"}
              </p>
              <p className="mt-1 text-xs text-[var(--text-secondary)]">
                {draft.user_email.trim() || "your@email.com"}
              </p>
            </div>

            <div className="rounded border border-[var(--border)] bg-[var(--surface-2)] p-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--text-muted)]">
                Fallback To
              </p>
              <p className="mt-2 text-sm font-medium text-[var(--text-primary)]">
                {draft.employer_name.trim() || "Client"}
              </p>
              <p className="mt-1 text-xs text-[var(--text-muted)]">
                Used only when no client billing profile is attached to the invoice.
              </p>
            </div>
          </div>
        </SettingsSectionCard>
      </div>

      <SettingsActionBar
        dirty={dirty}
        saving={saving}
        saveDisabled={!emailValid}
        status={status}
        onSave={save}
        onReset={reset}
      />
    </div>
  );
}

function ThemePreviewTile({
  theme,
  active,
  onClick,
}: {
  theme: Settings["theme"];
  active: boolean;
  onClick: () => void;
}) {
  const palette =
    theme === "light"
      ? {
          surface0: "#ebebf0",
          surface1: "#f7f7fb",
          surface2: "#e4e4ec",
          text: "#18182c",
          muted: "#7878a0",
          brand: "#5c57c8",
        }
      : {
          surface0: "#202325",
          surface1: "#272b2d",
          surface2: "#2e3234",
          text: "#dfe1e3",
          muted: "#5c6166",
          brand: "#6e68b8",
        };

  return (
    <button
      onClick={onClick}
      className={`rounded border p-3 text-left transition-colors ${
        active
          ? "border-[var(--brand-muted-border)] bg-[var(--brand-muted)]"
          : "border-[var(--border)] bg-[var(--surface-2)] hover:bg-[var(--surface-3)]"
      }`}
    >
      <div
        className="rounded border p-2"
        style={{
          background: palette.surface0,
          borderColor: theme === "light" ? "rgba(0,0,0,0.1)" : "rgba(255,255,255,0.08)",
        }}
      >
        <div
          className="rounded border px-2 py-2"
          style={{
            background: palette.surface1,
            borderColor: theme === "light" ? "rgba(0,0,0,0.12)" : "rgba(255,255,255,0.08)",
          }}
        >
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <div className="h-2 w-14 rounded-full" style={{ background: palette.text }} />
              <div className="h-1.5 w-10 rounded-full" style={{ background: palette.muted, opacity: 0.8 }} />
            </div>
            <div className="h-5 w-5 rounded-full" style={{ background: palette.brand }} />
          </div>
          <div
            className="mt-3 rounded border px-2 py-1.5"
            style={{
              background: palette.surface2,
              borderColor: theme === "light" ? "rgba(0,0,0,0.12)" : "rgba(255,255,255,0.08)",
            }}
          >
            <div className="h-1.5 w-12 rounded-full" style={{ background: palette.text, opacity: 0.9 }} />
          </div>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between">
        <div>
          <p className="text-sm font-medium capitalize text-[var(--text-primary)]">{theme}</p>
          <p className="mt-0.5 text-xs text-[var(--text-muted)]">
            {theme === "dark" ? "Default workspace palette" : "High-contrast daylight palette"}
          </p>
        </div>
        {active && <SettingsPill label="Selected" tone="brand" />}
      </div>
    </button>
  );
}

function AppearanceSettingsSection({
  settings,
  updateMany,
}: {
  settings: Settings;
  updateMany: (changes: Array<{ key: string; value: string }>) => Promise<Settings>;
}) {
  const [draftTheme, setDraftTheme] = useState<Settings["theme"]>(settings.theme);
  const [status, setStatus] = useState<StatusMessageState>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraftTheme(settings.theme);
  }, [settings.theme]);

  useEffect(() => {
    applyThemePreview(draftTheme);
    return () => {
      applyThemePreview(settings.theme);
    };
  }, [draftTheme, settings.theme]);

  const dirty = draftTheme !== settings.theme;

  const save = async () => {
    setSaving(true);
    try {
      await updateMany([{ key: "theme", value: draftTheme }]);
      applyThemePreview(draftTheme);
      setStatus({ tone: "success", message: "Theme preference updated." });
    } catch (e) {
      setStatus({ tone: "danger", message: `Unable to save theme: ${e}` });
    } finally {
      setSaving(false);
    }
  };

  const reset = () => {
    setDraftTheme(settings.theme);
    applyThemePreview(settings.theme);
    setStatus(null);
  };

  return (
    <div className="space-y-4">
      <SettingsSectionCard
        title="Theme"
        description="Preview the app chrome here. Invoice PDFs continue using their own exported styling."
      >
        <div className="grid gap-3 md:grid-cols-2">
          <ThemePreviewTile
            theme="dark"
            active={draftTheme === "dark"}
            onClick={() => {
              setDraftTheme("dark");
              setStatus(null);
            }}
          />
          <ThemePreviewTile
            theme="light"
            active={draftTheme === "light"}
            onClick={() => {
              setDraftTheme("light");
              setStatus(null);
            }}
          />
        </div>
      </SettingsSectionCard>

      <SettingsSectionCard
        title="About This Setting"
        description="Appearance is purely local to the desktop app."
      >
        <div className="rounded border border-[var(--border)] bg-[var(--surface-2)] p-3">
          <p className="text-sm text-[var(--text-secondary)]">
            Theme changes affect navigation, dashboards, settings, and working screens inside Tock.
            They do not change the look of invoice PDFs you send to clients.
          </p>
        </div>
      </SettingsSectionCard>

      <SettingsActionBar
        dirty={dirty}
        saving={saving}
        status={status}
        onSave={save}
        onReset={reset}
      />
    </div>
  );
}

function ShortcutSettingRow({
  definition,
  value,
  listening,
  isMac,
  error,
  onChange,
  onStartListening,
  onStopListening,
}: {
  definition: (typeof SHORTCUT_DEFINITIONS)[number];
  value: string;
  listening: boolean;
  isMac: boolean;
  error?: string;
  onChange: (value: string) => void;
  onStartListening: () => void;
  onStopListening: () => void;
}) {
  const matchesDefault =
    normalizeShortcut(value) === normalizeShortcut(definition.defaultShortcut ?? "");

  return (
    <div className="px-3 py-2.5">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
        <p className="min-w-0 text-[13px] font-medium text-[var(--text-primary)]">
          {definition.title}
        </p>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
          <ShortcutCaptureButton
            value={value}
            listening={listening}
            isMac={isMac}
            onChange={onChange}
            onStartListening={onStartListening}
            onStopListening={onStopListening}
          />
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => onChange("")}
              disabled={!value}
              className="h-8 rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-2.5 text-xs text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-3)] disabled:opacity-50"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={() => onChange(definition.defaultShortcut ?? "")}
              disabled={!definition.defaultShortcut || matchesDefault}
              className="h-8 rounded-md px-2.5 text-xs text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-3)] disabled:opacity-50"
            >
              Default
            </button>
          </div>
        </div>
      </div>
      {error && <p className="mt-2 text-[11px] text-[var(--warning)]">{error}</p>}
    </div>
  );
}

function ShortcutsSettingsSection({
  settings,
  updateShortcuts,
  onShortcutCaptureActiveChange,
}: {
  settings: Settings;
  updateShortcuts: (bindings: Record<string, string>) => Promise<Settings>;
  onShortcutCaptureActiveChange?: (active: boolean) => void;
}) {
  const isMac = useMemo(() => navigator.platform.toUpperCase().includes("MAC"), []);
  const [draft, setDraft] = useState<ShortcutDraftState>(getShortcutDraftFromSettings(settings));
  const [status, setStatus] = useState<StatusMessageState>(null);
  const [saving, setSaving] = useState(false);
  const [activeRecorderId, setActiveRecorderId] = useState<ShortcutActionId | null>(null);

  useEffect(() => {
    setDraft(getShortcutDraftFromSettings(settings));
    setActiveRecorderId(null);
  }, [settings.shortcut_bindings]);

  useEffect(() => {
    onShortcutCaptureActiveChange?.(activeRecorderId !== null);
  }, [activeRecorderId, onShortcutCaptureActiveChange]);

  useEffect(() => {
    return () => {
      onShortcutCaptureActiveChange?.(false);
    };
  }, [onShortcutCaptureActiveChange]);

  const persistedDraft = useMemo(() => getShortcutDraftFromSettings(settings), [settings]);
  const dirty = SHORTCUT_DEFINITIONS.some(
    (definition) => normalizeShortcut(draft[definition.id]) !== normalizeShortcut(persistedDraft[definition.id]),
  );

  const validationErrors = useMemo(() => getShortcutValidationErrors(draft), [draft]);
  const normalizedBindings = useMemo(() => normalizeShortcutBindings(draft), [draft]);
  const errorCount = Object.keys(validationErrors).length;

  const groupedDefinitions = useMemo(() => {
    const groups = new Map<string, typeof SHORTCUT_DEFINITIONS>();
    for (const definition of SHORTCUT_DEFINITIONS) {
      const existing = groups.get(definition.group) ?? [];
      groups.set(definition.group, [...existing, definition]);
    }
    return Array.from(groups.entries());
  }, []);

  const save = async () => {
    if (errorCount > 0) {
      setStatus({
        tone: "danger",
        message: "Fix the shortcut conflicts before saving.",
      });
      return;
    }

    setSaving(true);
    try {
      await updateShortcuts(normalizedBindings as Record<string, string>);
      setActiveRecorderId(null);
      setStatus({ tone: "success", message: "Shortcut settings updated." });
    } catch (e) {
      setStatus({ tone: "danger", message: `Unable to save shortcuts: ${e}` });
    } finally {
      setSaving(false);
    }
  };

  const reset = () => {
    setDraft(persistedDraft);
    setActiveRecorderId(null);
    setStatus(null);
  };

  return (
    <div className="space-y-4">
      {groupedDefinitions.map(([group, definitions]) => (
        <section
          key={group}
          className="overflow-hidden rounded border border-[var(--border)] bg-[var(--surface-1)]"
        >
          <div className="border-b border-[var(--border)] px-3 py-2">
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">
              {group}
            </h3>
          </div>
          <div className="divide-y divide-[var(--border)]">
            {definitions.map((definition) => (
              <ShortcutSettingRow
                key={definition.id}
                definition={definition}
                value={draft[definition.id]}
                listening={activeRecorderId === definition.id}
                isMac={isMac}
                error={validationErrors[definition.id]}
                onStartListening={() => {
                  setActiveRecorderId(definition.id);
                  setStatus(null);
                }}
                onStopListening={() => {
                  setActiveRecorderId((current) => (current === definition.id ? null : current));
                }}
                onChange={(value) => {
                  setActiveRecorderId(null);
                  setDraft((current) => ({ ...current, [definition.id]: normalizeShortcut(value) }));
                  setStatus(null);
                }}
              />
            ))}
          </div>
        </section>
      ))}

      <SettingsActionBar
        dirty={dirty}
        saving={saving}
        saveDisabled={errorCount > 0}
        status={
          errorCount > 0 && !status
            ? {
                tone: "warning",
                message: `Fix ${errorCount} shortcut ${errorCount === 1 ? "issue" : "issues"} before saving.`,
              }
            : status
        }
        onSave={save}
        onReset={reset}
      />
    </div>
  );
}

function ClientEditorCard({
  name,
  rate,
  billingName,
  billingEmail,
  editingId,
  error,
  onNameChange,
  onRateChange,
  onBillingNameChange,
  onBillingEmailChange,
  onSubmit,
  onReset,
}: {
  name: string;
  rate: string;
  billingName: string;
  billingEmail: string;
  editingId: string | null;
  error: string;
  onNameChange: (value: string) => void;
  onRateChange: (value: string) => void;
  onBillingNameChange: (value: string) => void;
  onBillingEmailChange: (value: string) => void;
  onSubmit: () => Promise<void>;
  onReset: () => void;
}) {
  return (
    <SettingsSectionCard
      title={editingId ? "Edit Client" : "Add Client"}
      description={
        editingId
          ? "Update the billing profile and default rate for this client."
          : "Create a client profile with the information you use most often when invoicing."
      }
    >
      <div className="space-y-4">
        <SettingsField label="Client name">
          <TextInput value={name} onChange={onNameChange} placeholder="Acme Corp" />
        </SettingsField>

        <SettingsField label="Default rate">
          <div className="grid grid-cols-[auto_1fr_auto] items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3">
            <span className="text-xs text-[var(--text-muted)]">$</span>
            <input
              type="number"
              value={rate}
              onChange={(event) => onRateChange(event.target.value)}
              placeholder="75.00"
              className="w-full bg-transparent py-2 text-sm text-[var(--text-primary)] focus:outline-none"
            />
            <span className="text-xs text-[var(--text-muted)]">/hr</span>
          </div>
        </SettingsField>

        <div className="grid gap-4">
          <SettingsField label="Billing name" description="Used in the recipient block of invoices.">
            <TextInput value={billingName} onChange={onBillingNameChange} placeholder="Acme Finance Team" />
          </SettingsField>

          <SettingsField label="Billing email" description="Used by the Gmail helper and contact reminders.">
            <TextInput
              type="email"
              value={billingEmail}
              onChange={onBillingEmailChange}
              placeholder="billing@acme.com"
            />
          </SettingsField>
        </div>

        {error && <SettingsStatusMessage status={{ tone: "danger", message: error }} />}

        <div className="flex items-center gap-2">
          <button onClick={onSubmit} className={buttonClass("primary")}>
            {editingId ? "Save Client" : "Add Client"}
          </button>
          <button onClick={onReset} className={buttonClass("secondary")}>
            {editingId ? "Cancel" : "Reset"}
          </button>
        </div>
      </div>
    </SettingsSectionCard>
  );
}

function ClientCard({
  client,
  editing,
  onEdit,
  onSetDefault,
  onArchive,
  onRestore,
}: {
  client: Client;
  editing: boolean;
  onEdit: () => void;
  onSetDefault: () => Promise<void>;
  onArchive: () => Promise<void>;
  onRestore: () => Promise<void>;
}) {
  const billingReady = !!client.billing_email;
  return (
    <div
      className={`rounded border px-4 py-3 transition-colors ${
        editing
          ? "border-[var(--brand-muted-border)] bg-[var(--brand-muted)]"
          : "border-[var(--border)] bg-[var(--surface-1)]"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-[var(--text-primary)]">{client.name}</p>
            {client.is_default && !client.is_archived && <SettingsPill label="Default" tone="brand" />}
            {client.is_archived && <SettingsPill label="Archived" />}
            {!client.is_archived && !billingReady && <SettingsPill label="Missing billing email" tone="warning" />}
          </div>
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            ${client.hourly_rate.toFixed(2)}/hr
            {client.billing_name || client.billing_email
              ? ` · ${client.billing_name || client.name}${client.billing_email ? ` · ${client.billing_email}` : ""}`
              : ""}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {!client.is_archived && !client.is_default && (
            <button onClick={onSetDefault} className={buttonClass("secondary")}>
              Set default
            </button>
          )}
          <button onClick={onEdit} className={buttonClass("secondary")}>
            Edit
          </button>
          {client.is_archived ? (
            <button onClick={onRestore} className={buttonClass("secondary")}>
              Restore
            </button>
          ) : (
            <button onClick={onArchive} className={buttonClass("secondary")}>
              Archive
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function ClientsSettingsSection() {
  const { clients, activeClients, add, update, setDefault, archive, unarchive } = useClients();
  const [name, setName] = useState("");
  const [rate, setRate] = useState("75.00");
  const [billingName, setBillingName] = useState("");
  const [billingEmail, setBillingEmail] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [status, setStatus] = useState<StatusMessageState>(null);
  const [error, setError] = useState("");

  const archivedClients = useMemo(
    () => clients.filter((client) => client.is_archived),
    [clients]
  );

  const resetForm = () => {
    setName("");
    setRate("75.00");
    setBillingName("");
    setBillingEmail("");
    setEditingId(null);
    setError("");
  };

  const startEditing = (client: Client) => {
    setEditingId(client.id);
    setName(client.name);
    setRate(client.hourly_rate.toFixed(2));
    setBillingName(client.billing_name ?? "");
    setBillingEmail(client.billing_email ?? "");
    setError("");
    setStatus(null);
  };

  const handleSubmit = async () => {
    setError("");
    setStatus(null);
    const rateNum = Number.parseFloat(rate);
    if (!name.trim()) {
      setError("Name is required.");
      return;
    }
    if (!Number.isFinite(rateNum) || rateNum < 0) {
      setError("Enter a valid hourly rate.");
      return;
    }

    try {
      if (editingId) {
        await update(
          editingId,
          name.trim(),
          rateNum,
          billingName.trim() || null,
          billingEmail.trim() || null
        );
        setStatus({ tone: "success", message: `Updated ${name.trim()}.` });
      } else {
        await add(
          name.trim(),
          rateNum,
          billingName.trim() || null,
          billingEmail.trim() || null
        );
        setStatus({ tone: "success", message: `Added ${name.trim()}.` });
      }
      resetForm();
    } catch (e) {
      setError(String(e));
    }
  };

  const runClientAction = async (action: () => Promise<unknown>, successMessage: string) => {
    setError("");
    try {
      await action();
      setStatus({ tone: "muted", message: successMessage });
    } catch (e) {
      setStatus({ tone: "danger", message: String(e) });
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-3">
        <SettingsStat label="Active Clients" value={String(activeClients.length)} />
        <SettingsStat
          label="Default Client"
          value={clients.find((client) => client.is_default && !client.is_archived)?.name || "None"}
        />
        <SettingsStat
          label="Ready To Email"
          value={String(activeClients.filter((client) => client.billing_email).length)}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
        <div className="xl:sticky xl:top-4 xl:self-start">
          <ClientEditorCard
            name={name}
            rate={rate}
            billingName={billingName}
            billingEmail={billingEmail}
            editingId={editingId}
            error={error}
            onNameChange={setName}
            onRateChange={setRate}
            onBillingNameChange={setBillingName}
            onBillingEmailChange={setBillingEmail}
            onSubmit={handleSubmit}
            onReset={() => {
              resetForm();
              setStatus(null);
            }}
          />
        </div>

        <div className="space-y-4">
          <SettingsStatusMessage status={status} />

          <SettingsSectionCard
            title={`Active Clients (${activeClients.length})`}
            description="Client profiles you can assign to entries and invoices right now."
          >
            <div className="space-y-3">
              {activeClients.length === 0 ? (
                <SettingsEmptyState
                  title="No active clients yet"
                  message="Create a client profile so rates and billing details are ready when you invoice."
                />
              ) : (
                activeClients.map((client) => (
                  <ClientCard
                    key={client.id}
                    client={client}
                    editing={editingId === client.id}
                    onEdit={() => startEditing(client)}
                    onSetDefault={() =>
                      runClientAction(
                        () => setDefault(client.id),
                        `${client.name} is now your default client.`
                      )
                    }
                    onArchive={() =>
                      runClientAction(() => archive(client.id), `${client.name} moved to archived clients.`)
                    }
                    onRestore={() =>
                      runClientAction(() => unarchive(client.id), `${client.name} restored.`)
                    }
                  />
                ))
              )}
            </div>
          </SettingsSectionCard>

          <SettingsSectionCard
            title={`Archived Clients (${archivedClients.length})`}
            description="Older clients stay here for history without cluttering your main working list."
          >
            <div className="space-y-3">
              {archivedClients.length === 0 ? (
                <SettingsEmptyState
                  title="No archived clients"
                  message="Archived client profiles will appear here when you want to keep history without showing them in the active list."
                />
              ) : (
                archivedClients.map((client) => (
                  <ClientCard
                    key={client.id}
                    client={client}
                    editing={editingId === client.id}
                    onEdit={() => startEditing(client)}
                    onSetDefault={() => Promise.resolve()}
                    onArchive={() => Promise.resolve()}
                    onRestore={() =>
                      runClientAction(() => unarchive(client.id), `${client.name} restored.`)
                    }
                  />
                ))
              )}
            </div>
          </SettingsSectionCard>
        </div>
      </div>
    </div>
  );
}

function TagEditorCard({
  name,
  color,
  editingId,
  error,
  onNameChange,
  onColorChange,
  onSubmit,
  onReset,
}: {
  name: string;
  color: string;
  editingId: string | null;
  error: string;
  onNameChange: (value: string) => void;
  onColorChange: (value: string) => void;
  onSubmit: () => Promise<void>;
  onReset: () => void;
}) {
  return (
    <SettingsSectionCard
      title={editingId ? "Edit Tag" : "Add Tag"}
      description={
        editingId
          ? "Refine the label and color used across your entries."
          : "Create a tag with a clear label and color so logs and invoices stay scannable."
      }
    >
      <div className="space-y-4">
        <div className="rounded border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2.5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--text-muted)]">
            Live Preview
          </p>
          <div className="mt-2">
            <TagBadge
              tag={{ name: name.trim() || "Tag name", color }}
              className="text-sm font-medium text-[var(--text-primary)]"
            />
          </div>
        </div>

        <SettingsField label="Tag name">
          <TextInput value={name} onChange={onNameChange} placeholder="Meeting" />
        </SettingsField>

        <SettingsField label="Color">
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={color}
                onChange={(event) => onColorChange(event.target.value)}
                className="h-10 w-12 rounded border border-[var(--border)] bg-[var(--surface-1)]"
              />
              <TextInput value={color} onChange={onColorChange} placeholder="#64748b" />
            </div>
            <div className="flex flex-wrap gap-2">
              {TAG_COLOR_PRESETS.map((preset) => (
                <button
                  key={preset}
                  onClick={() => onColorChange(preset)}
                  className={`h-7 w-7 rounded-full border-2 transition-transform hover:scale-105 ${
                    preset.toLowerCase() === color.toLowerCase()
                      ? "border-[var(--text-primary)]"
                      : "border-transparent"
                  }`}
                  style={{ background: preset }}
                />
              ))}
            </div>
          </div>
        </SettingsField>

        {error && <SettingsStatusMessage status={{ tone: "danger", message: error }} />}

        <div className="flex items-center gap-2">
          <button onClick={onSubmit} className={buttonClass("primary")}>
            {editingId ? "Save Tag" : "Add Tag"}
          </button>
          <button onClick={onReset} className={buttonClass("secondary")}>
            {editingId ? "Cancel" : "Reset"}
          </button>
        </div>
      </div>
    </SettingsSectionCard>
  );
}

function TagCard({
  tag,
  editing,
  onEdit,
  onArchive,
  onRestore,
}: {
  tag: EntryTag;
  editing: boolean;
  onEdit: () => void;
  onArchive: () => Promise<void>;
  onRestore: () => Promise<void>;
}) {
  return (
    <div
      className={`rounded border px-4 py-3 transition-colors ${
        editing
          ? "border-[var(--brand-muted-border)] bg-[var(--brand-muted)]"
          : "border-[var(--border)] bg-[var(--surface-1)]"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <TagBadge tag={tag} className="text-sm font-medium text-[var(--text-primary)]" />
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {tag.is_archived ? <SettingsPill label="Archived" /> : <SettingsPill label="Active" tone="brand" />}
            <span className="text-[11px] text-[var(--text-muted)]">Color {tag.color}</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button onClick={onEdit} className={buttonClass("secondary")}>
            Edit
          </button>
          {tag.is_archived ? (
            <button onClick={onRestore} className={buttonClass("secondary")}>
              Restore
            </button>
          ) : (
            <button onClick={onArchive} className={buttonClass("secondary")}>
              Archive
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function TagsSettingsSection() {
  const { tags, add, update, archive, unarchive } = useTags();
  const [name, setName] = useState("");
  const [color, setColor] = useState("#64748b");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [status, setStatus] = useState<StatusMessageState>(null);

  const activeTags = useMemo(() => tags.filter((tag) => !tag.is_archived), [tags]);
  const archivedTags = useMemo(() => tags.filter((tag) => tag.is_archived), [tags]);

  const resetForm = () => {
    setName("");
    setColor("#64748b");
    setEditingId(null);
    setError("");
  };

  const startEditing = (tag: EntryTag) => {
    setEditingId(tag.id);
    setName(tag.name);
    setColor(tag.color);
    setError("");
    setStatus(null);
  };

  const handleSubmit = async () => {
    setError("");
    setStatus(null);
    if (!name.trim()) {
      setError("Tag name is required.");
      return;
    }

    try {
      if (editingId) {
        await update(editingId, name.trim(), color);
        setStatus({ tone: "success", message: `Updated ${name.trim()}.` });
      } else {
        await add(name.trim(), color);
        setStatus({ tone: "success", message: `Added ${name.trim()}.` });
      }
      resetForm();
    } catch (e) {
      setError(String(e));
    }
  };

  const runTagAction = async (action: () => Promise<unknown>, successMessage: string) => {
    try {
      await action();
      setStatus({ tone: "muted", message: successMessage });
    } catch (e) {
      setStatus({ tone: "danger", message: String(e) });
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-3">
        <SettingsStat label="Active Tags" value={String(activeTags.length)} />
        <SettingsStat label="Archived Tags" value={String(archivedTags.length)} />
        <SettingsStat label="Current Accent" value={color.toUpperCase()} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
        <div className="xl:sticky xl:top-4 xl:self-start">
          <TagEditorCard
            name={name}
            color={color}
            editingId={editingId}
            error={error}
            onNameChange={setName}
            onColorChange={setColor}
            onSubmit={handleSubmit}
            onReset={() => {
              resetForm();
              setStatus(null);
            }}
          />
        </div>

        <div className="space-y-4">
          <SettingsStatusMessage status={status} />

          <SettingsSectionCard
            title={`Active Tags (${activeTags.length})`}
            description="Primary labels available throughout your timer and log views."
          >
            <div className="space-y-3">
              {activeTags.length === 0 ? (
                <SettingsEmptyState
                  title="No active tags yet"
                  message="Create a tag above to start organizing entries with consistent labels."
                />
              ) : (
                activeTags.map((tag) => (
                  <TagCard
                    key={tag.id}
                    tag={tag}
                    editing={editingId === tag.id}
                    onEdit={() => startEditing(tag)}
                    onArchive={() =>
                      runTagAction(() => archive(tag.id), `${tag.name} moved to archived tags.`)
                    }
                    onRestore={() =>
                      runTagAction(() => unarchive(tag.id), `${tag.name} restored.`)
                    }
                  />
                ))
              )}
            </div>
          </SettingsSectionCard>

          <SettingsSectionCard
            title={`Archived Tags (${archivedTags.length})`}
            description="Quiet storage for older labels you still want to keep for history."
          >
            <div className="space-y-3">
              {archivedTags.length === 0 ? (
                <SettingsEmptyState
                  title="No archived tags"
                  message="Archived tags will appear here when you want to remove them from active use without losing history."
                />
              ) : (
                archivedTags.map((tag) => (
                  <TagCard
                    key={tag.id}
                    tag={tag}
                    editing={editingId === tag.id}
                    onEdit={() => startEditing(tag)}
                    onArchive={() => Promise.resolve()}
                    onRestore={() =>
                      runTagAction(() => unarchive(tag.id), `${tag.name} restored.`)
                    }
                  />
                ))
              )}
            </div>
          </SettingsSectionCard>
        </div>
      </div>
    </div>
  );
}

function DataSettingsSection({
  settings,
  update,
}: {
  settings: Settings;
  update: (key: string, value: string) => Promise<Settings>;
}) {
  const [csvStatus, setCsvStatus] = useState("");
  const [backupStatus, setBackupStatus] = useState<StatusMessageState>(null);
  const [backups, setBackups] = useState<BackupSummary[]>([]);
  const [backupsLoading, setBackupsLoading] = useState(true);

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
    loadBackups().catch(console.error);
  }, []);

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
        title: "Select CSV export folder",
      });
      if (typeof path === "string") {
        await update("backup_csv_path", `${path}/tock-hours.csv`);
        setCsvStatus(`CSV exports will use ${path}/tock-hours.csv`);
      }
    } catch (e) {
      setCsvStatus(`Error: ${e}`);
    }
  };

  const handlePickBackupDirectory = async () => {
    try {
      const path = await open({
        directory: true,
        title: "Select backup folder",
      });
      if (typeof path === "string") {
        await update("backup_directory", path);
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
      setBackupStatus({ tone: "success", message: `Backup created at ${summary.path}` });
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
        tone: "warning",
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

  return (
    <div className="space-y-4">
      <SettingsSectionCard
        title="Backup Storage"
        description="Full app backups are stored here automatically and when you create one manually."
      >
        <div className="space-y-4">
          <SettingsField label="Backup folder">
            <div className="flex items-center gap-2">
              <span className="flex-1 truncate rounded border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-xs text-[var(--text-muted)]">
                {settings.backup_directory}
              </span>
              <button onClick={handlePickBackupDirectory} className={buttonClass("secondary")}>
                Browse…
              </button>
            </div>
          </SettingsField>

          <SettingsField label="Automatic backups" description="Create rolling local backups after every successful data change.">
            <button
              onClick={() => update("auto_backup_enabled", settings.auto_backup_enabled ? "0" : "1")}
              className={buttonClass("secondary")}
            >
              {settings.auto_backup_enabled ? "Enabled" : "Disabled"}
            </button>
          </SettingsField>

          <SettingsStatusMessage status={backupStatus} />
        </div>
      </SettingsSectionCard>

      <SettingsSectionCard
        title="Backup Actions"
        description="Create a full backup, restore one, or open the backup folder."
      >
        <div className="flex flex-wrap gap-2">
          <button onClick={handleCreateBackupNow} className={buttonClass("primary")}>
            Create Backup Now
          </button>
          <button onClick={handleRestoreBackup} className={buttonClass("secondary")}>
            Restore Backup…
          </button>
          <button onClick={handleOpenBackupFolder} className={buttonClass("secondary")}>
            Open Backup Folder
          </button>
        </div>
      </SettingsSectionCard>

      <SettingsSectionCard
        title="Recent Backups"
        description="Newest full-snapshot backups in your configured backup folder."
      >
        {backupsLoading ? (
          <p className="text-xs text-[var(--text-muted)]">Loading backups…</p>
        ) : backups.length === 0 ? (
          <SettingsEmptyState
            title="No backups yet"
            message="Create your first backup here and future automatic snapshots will show up in this list."
          />
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
      </SettingsSectionCard>

      <SettingsSectionCard
        title="CSV Export"
        description="Separate timesheet export location. CSV is no longer the primary backup format."
      >
        <div className="space-y-4">
          <SettingsField label="CSV export path">
            <div className="flex items-center gap-2">
              <span className="flex-1 truncate rounded border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-xs text-[var(--text-muted)]">
                {settings.backup_csv_path || "Default (app data)"}
              </span>
              <button onClick={handlePickCsvPath} className={buttonClass("secondary")}>
                Browse…
              </button>
            </div>
          </SettingsField>

          <div className="flex items-center gap-3">
            <button onClick={handleExportNow} className={buttonClass("secondary")}>
              Export CSV
            </button>
            {csvStatus && <span className="text-xs text-[var(--text-muted)]">{csvStatus}</span>}
          </div>
        </div>
      </SettingsSectionCard>
    </div>
  );
}

export function SettingsView({
  activeSection,
  onChangeSection,
  onShortcutCaptureActiveChange,
}: {
  activeSection: SettingsSection;
  onChangeSection: (section: SettingsSection) => void;
  onShortcutCaptureActiveChange?: (active: boolean) => void;
}) {
  const { settings, loading, update, updateMany, updateShortcuts } = useSettings();

  if (loading || !settings) {
    return (
      <div className="flex-1 flex items-center justify-center text-[var(--text-muted)]">
        Loading settings…
      </div>
    );
  }

  const activeMeta = NAV_ITEMS.find((item) => item.id === activeSection) ?? NAV_ITEMS[0];

  return (
    <div className="flex-1 flex overflow-hidden">
      <nav className="w-44 flex-shrink-0 border-r border-[var(--border)] bg-[var(--surface-1)] px-2 py-3 space-y-px">
        {NAV_ITEMS.map(({ id, label, icon: Icon }) => {
          const active = activeSection === id;
          return (
            <button
              key={id}
              onClick={() => onChangeSection(id)}
              className={`relative w-full flex items-center gap-2.5 px-3 py-2 rounded text-[13px] font-medium text-left transition-colors ${
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
        <div className="px-5 py-5 max-w-3xl">
          <SettingsPageHeader
            eyebrow={activeMeta.eyebrow}
            title={activeMeta.label}
            description={activeMeta.description}
          />

          {activeSection === "billing" && (
            <BillingSettingsSection settings={settings} updateMany={updateMany} />
          )}

          {activeSection === "identity" && (
            <IdentitySettingsSection settings={settings} updateMany={updateMany} />
          )}

          {activeSection === "appearance" && (
            <AppearanceSettingsSection settings={settings} updateMany={updateMany} />
          )}

          {activeSection === "shortcuts" && (
            <ShortcutsSettingsSection
              settings={settings}
              updateShortcuts={updateShortcuts}
              onShortcutCaptureActiveChange={onShortcutCaptureActiveChange}
            />
          )}

          {activeSection === "clients" && <ClientsSettingsSection />}

          {activeSection === "tags" && <TagsSettingsSection />}

          {activeSection === "data" && <DataSettingsSection settings={settings} update={update} />}
        </div>
      </div>
    </div>
  );
}
