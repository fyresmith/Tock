import { useState } from "react";
import { EntryTag, TimeEntry, UpdateEntryArgs } from "../../lib/commands";
import { formatDate, formatTime, minutesToHHMM } from "../../lib/dateUtils";
import { TagBadge } from "../tags/TagBadge";
import { getSelectableTags, TagSelect } from "../tags/TagSelect";
import { Pencil, Trash2, Check } from "lucide-react";

interface EntryRowProps {
  entry: TimeEntry;
  tags: EntryTag[];
  onUpdate: (args: UpdateEntryArgs) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

export function EntryRow({ entry, tags, onUpdate, onDelete }: EntryRowProps) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    description: entry.description,
    tag_id: entry.tag_id ?? "",
    start_time: entry.start_time,
    end_time: entry.end_time ?? "",
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
        start_time: form.start_time,
        end_time: form.end_time,
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
      start_time: entry.start_time,
      end_time: entry.end_time ?? "",
    });
    setEditing(false);
  };

  if (editing) {
    return (
      <tr className="bg-[var(--surface-2)]">
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
        <td className="px-4 py-2 text-xs text-[var(--text-muted)]">—</td>
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
    <tr className="hover:bg-[var(--surface-2)] transition-colors group">
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
      <td
        className="px-4 py-2.5 text-sm font-mono text-[var(--text-primary)]"
        style={{ fontVariantNumeric: "tabular-nums" }}
      >
        {entry.duration_minutes != null ? minutesToHHMM(entry.duration_minutes) : "—"}
      </td>
      <td className="px-4 py-2.5">
        <div className="flex items-center gap-1">
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
