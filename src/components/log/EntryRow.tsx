import { useState } from "react";
import { Client, EntryTag, TimeEntry, UpdateEntryArgs } from "../../lib/commands";
import { formatDate, formatTime, minutesToHHMM } from "../../lib/dateUtils";
import { TagBadge } from "../tags/TagBadge";
import { getSelectableTags, TagSelect } from "../tags/TagSelect";
import { Pencil, Trash2, Check } from "lucide-react";

interface EntryRowProps {
  entry: TimeEntry;
  tags: EntryTag[];
  clients: Client[];
  onUpdate: (args: UpdateEntryArgs) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  selected?: boolean;
  onToggle?: (id: string) => void;
}

export function EntryRow({ entry, tags, clients, onUpdate, onDelete, selected, onToggle }: EntryRowProps) {
  const clientName = entry.client_id
    ? (clients.find((c) => c.id === entry.client_id)?.name ?? null)
    : null;
  const editableClients = clients.filter((client) => !client.is_archived || client.id === entry.client_id);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    description: entry.description,
    tag_id: entry.tag_id ?? "",
    client_id: entry.client_id ?? "",
    start_time: entry.start_time,
    end_time: entry.end_time ?? "",
    billable: entry.billable,
    rateOverride: entry.hourly_rate,
  });
  const [saving, setSaving] = useState(false);
  const selectableTags = getSelectableTags(tags, entry.tag_id);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onUpdate({
        id: entry.id,
        description: form.description,
        tag_id: form.tag_id,
        client_id: form.client_id,
        start_time: form.start_time,
        end_time: form.end_time,
        billable: form.billable,
        hourly_rate: form.rateOverride,
      });
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setForm({
      description: entry.description,
      tag_id: entry.tag_id ?? "",
      client_id: entry.client_id ?? "",
      start_time: entry.start_time,
      end_time: entry.end_time ?? "",
      billable: entry.billable,
      rateOverride: entry.hourly_rate,
    });
    setEditing(false);
  };

  if (editing) {
    return (
      <tr className="bg-[var(--surface-2)]">
        <td className="px-4 py-2" />
        <td className="px-4 py-2 text-sm text-[var(--text-secondary)]">
          {formatDate(entry.date)}
        </td>
        <td className="px-4 py-2">
          <div className="flex gap-1 items-center">
            <input
              type="time"
              value={form.start_time.slice(0, 5)}
              onChange={(e) => setForm({ ...form, start_time: e.target.value + ":00" })}
              className="bg-[var(--surface-1)] border border-[var(--border)] rounded px-2 py-1 text-xs text-[var(--text-primary)] w-24 focus:border-[var(--brand)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-muted)]"
            />
            <span className="text-[var(--text-muted)] text-xs">–</span>
            <input
              type="time"
              value={form.end_time.slice(0, 5)}
              onChange={(e) => setForm({ ...form, end_time: e.target.value + ":00" })}
              className="bg-[var(--surface-1)] border border-[var(--border)] rounded px-2 py-1 text-xs text-[var(--text-primary)] w-24 focus:border-[var(--brand)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-muted)]"
            />
          </div>
        </td>
        <td className="px-4 py-2">
          <input
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            className="w-full bg-[var(--surface-1)] border border-[var(--border)] rounded px-2 py-1 text-sm text-[var(--text-primary)] focus:border-[var(--brand)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-muted)]"
            autoFocus
          />
        </td>
        <td className="px-4 py-2">
          <TagSelect
            tags={selectableTags}
            value={form.tag_id}
            onChange={(tag_id) => setForm({ ...form, tag_id })}
            className="bg-[var(--surface-1)] border border-[var(--border)] rounded px-2 py-1 text-xs text-[var(--text-primary)] focus:border-[var(--brand)] focus:outline-none"
          />
        </td>
        <td className="px-4 py-2">
          <select
            value={form.client_id}
            onChange={(e) => setForm({ ...form, client_id: e.target.value })}
            className="bg-[var(--surface-1)] border border-[var(--border)] rounded px-2 py-1 text-xs text-[var(--text-primary)] focus:border-[var(--brand)] focus:outline-none min-w-32"
          >
            <option value="">No client</option>
            {editableClients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.name}
                {client.is_archived ? " (archived)" : ""}
              </option>
            ))}
          </select>
        </td>
        <td className="px-4 py-2">
          <div className="flex flex-col gap-1.5">
            <label className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)] cursor-pointer select-none">
              <input
                type="checkbox"
                checked={form.billable}
                onChange={(e) => setForm({ ...form, billable: e.target.checked })}
              />
              Billable
            </label>
            <input
              type="number"
              placeholder="Rate override"
              value={form.rateOverride ?? ""}
              onChange={(e) => setForm({ ...form, rateOverride: e.target.value ? Number(e.target.value) : null })}
              className="w-24 bg-[var(--surface-1)] border border-[var(--border)] rounded px-2 py-1 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--brand)] focus:outline-none"
            />
          </div>
        </td>
        <td className="px-4 py-2">
          <div className="flex gap-1">
            <button
              onClick={handleSave}
              disabled={saving}
              className="p-1.5 rounded bg-[var(--brand)] text-white disabled:opacity-50 hover:bg-[var(--brand-hover)] transition-colors"
              title="Save"
            >
              <Check size={13} />
            </button>
            <button
              onClick={handleCancel}
              className="px-3 py-1 rounded text-xs text-[var(--text-secondary)] hover:bg-[var(--surface-3)] transition-colors"
            >
              Cancel
            </button>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <tr className={`hover:bg-[var(--surface-2)] transition-colors group ${selected ? "bg-[var(--brand-muted)]" : ""}`}>
      <td className="px-4 py-2.5">
        {onToggle && (
          <input
            type="checkbox"
            checked={selected ?? false}
            onChange={() => onToggle(entry.id)}
            className="rounded"
          />
        )}
      </td>
      <td className="px-4 py-2.5 text-sm text-[var(--text-secondary)] whitespace-nowrap">
        {formatDate(entry.date)}
      </td>
      <td
        className="px-4 py-2.5 text-xs text-[var(--text-secondary)] whitespace-nowrap font-mono"
        style={{ fontVariantNumeric: "tabular-nums" }}
      >
        {formatTime(entry.start_time)} – {entry.end_time ? formatTime(entry.end_time) : "—"}
      </td>
      <td className="px-4 py-2.5 text-sm text-[var(--text-primary)] max-w-xs truncate">
        {entry.description || (
          <span className="text-[var(--text-muted)] italic">No description</span>
        )}
      </td>
      <td className="px-4 py-2.5">
        <TagBadge tag={entry} className="text-xs text-[var(--text-secondary)]" />
      </td>
      <td className="px-4 py-2.5 text-xs text-[var(--text-secondary)] whitespace-nowrap">
        {clientName ?? <span className="text-[var(--text-muted)] opacity-40">—</span>}
      </td>
      <td
        className="px-4 py-2.5 text-sm font-mono text-[var(--text-primary)]"
        style={{ fontVariantNumeric: "tabular-nums" }}
      >
        {entry.duration_minutes != null ? minutesToHHMM(entry.duration_minutes) : "—"}
      </td>
      <td className="px-4 py-2.5">
        <div className="flex items-center gap-1">
          {!entry.billable && (
            <span className="px-1.5 py-0.5 rounded text-xs bg-[var(--text-muted)]/10 text-[var(--text-muted)] mr-1">
              non-billable
            </span>
          )}
          {entry.hourly_rate != null && (
            <span className="px-1.5 py-0.5 rounded text-xs bg-[var(--brand-muted)] text-[var(--brand)] mr-1">
              ${entry.hourly_rate}/hr
            </span>
          )}
          {entry.invoiced && (
            <span className="px-1.5 py-0.5 rounded text-xs bg-[var(--success)]/20 text-[var(--success)] mr-1">
              invoiced
            </span>
          )}
          <button
            onClick={() => setEditing(true)}
            className="p-1.5 rounded text-[var(--text-muted)] opacity-30 group-hover:opacity-100 hover:bg-[var(--surface-3)] hover:text-[var(--text-primary)] transition-all"
            title="Edit"
          >
            <Pencil size={14} />
          </button>
          <button
            onClick={() => onDelete(entry.id)}
            className="p-1.5 rounded text-[var(--text-muted)] opacity-30 group-hover:opacity-100 hover:bg-[var(--danger)]/15 hover:text-[var(--danger)] transition-all"
            title="Delete"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </td>
    </tr>
  );
}
