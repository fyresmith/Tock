import { useMemo, useState } from "react";
import {
  eachDayOfInterval,
  endOfMonth,
  format,
  getDay,
  isToday as dfIsToday,
  parseISO,
  startOfMonth,
} from "date-fns";
import { EntryTag, TimeEntry, UpdateEntryArgs } from "../../lib/commands";
import { formatTime, minutesToHHMM } from "../../lib/dateUtils";
import { TagBadge } from "../tags/TagBadge";
import { getSelectableTags, TagSelect } from "../tags/TagSelect";
import { Check, Pencil, Trash2 } from "lucide-react";

interface MonthViewProps {
  entries: TimeEntry[];
  tags: EntryTag[];
  month: Date;
  selectedDay: string;
  onSelectDay: (day: string) => void;
  onUpdate: (args: UpdateEntryArgs) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

const DAY_HEADERS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function mondayOffset(date: Date): number {
  const d = getDay(date);
  return d === 0 ? 6 : d - 1;
}

export function MonthView({
  entries,
  tags,
  month,
  selectedDay,
  onSelectDay,
  onUpdate,
  onDelete,
}: MonthViewProps) {
  const byDate = useMemo(() => {
    const map = new Map<string, TimeEntry[]>();
    for (const entry of entries) {
      const list = map.get(entry.date) ?? [];
      list.push(entry);
      map.set(entry.date, list);
    }
    return map;
  }, [entries]);

  const days = useMemo(
    () => eachDayOfInterval({ start: startOfMonth(month), end: endOfMonth(month) }),
    [month]
  );
  const startOffset = mondayOffset(days[0]);
  const selectedEntries = byDate.get(selectedDay) ?? [];
  const selectedTotal = selectedEntries.reduce((sum, entry) => sum + (entry.duration_minutes ?? 0), 0);

  return (
    <div className="flex flex-1 overflow-hidden">
      <div className="flex-1 overflow-auto p-4 min-w-0">
        <div className="grid grid-cols-7 mb-1">
          {DAY_HEADERS.map((day) => (
            <div
              key={day}
              className="text-center text-[11px] font-medium text-[var(--text-muted)] uppercase tracking-wider py-1.5"
            >
              {day}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: startOffset }).map((_, index) => (
            <div key={`gap-${index}`} />
          ))}

          {days.map((day) => {
            const dateStr = format(day, "yyyy-MM-dd");
            const dayEntries = byDate.get(dateStr) ?? [];
            const totalMinutes = dayEntries.reduce((sum, entry) => sum + (entry.duration_minutes ?? 0), 0);
            const isToday = dfIsToday(day);
            const isSelected = selectedDay === dateStr;
            const hasEntries = dayEntries.length > 0;
            const tagDots = [...new Map(dayEntries.map((entry) => [entry.tag_id ?? entry.tag_name, entry])).values()];

            return (
              <button
                key={dateStr}
                onClick={() => onSelectDay(dateStr)}
                className={`relative min-h-[76px] rounded p-2 text-left transition-all border ${
                  isSelected
                    ? "bg-[var(--brand-muted)] border-[var(--brand-muted-border)]"
                    : hasEntries
                    ? "bg-[var(--surface-2)] border-[var(--border)] hover:border-[var(--border-strong)] hover:bg-[var(--surface-3)]"
                    : "bg-[var(--surface-1)] border-[var(--border)] hover:bg-[var(--surface-2)]"
                }`}
              >
                <span className="block mb-1">
                  {isToday ? (
                    <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-[var(--brand)] text-white text-[10px] font-bold">
                      {format(day, "d")}
                    </span>
                  ) : (
                    <span
                      className={`text-xs font-semibold ${
                        hasEntries ? "text-[var(--text-primary)]" : "text-[var(--text-muted)]"
                      }`}
                    >
                      {format(day, "d")}
                    </span>
                  )}
                </span>

                {totalMinutes > 0 && (
                  <span className="text-[11px] text-[var(--text-secondary)] tabular-nums leading-tight block">
                    {minutesToHHMM(totalMinutes)}
                  </span>
                )}

                {tagDots.length > 0 && (
                  <div className="absolute bottom-2 left-2 flex gap-0.5">
                    {tagDots.map((entry) => (
                      <span
                        key={`${entry.id}-dot`}
                        className="type-dot"
                        style={{ background: entry.tag_color }}
                      />
                    ))}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="w-72 flex-shrink-0 border-l border-[var(--border)] flex flex-col overflow-hidden animate-fade-in">
          <div className="px-4 py-3 border-b border-[var(--border)]">
            <p className="text-sm font-semibold text-[var(--text-primary)]">
              {format(parseISO(selectedDay), "EEEE, MMM d")}
            </p>
            <p className="text-xs text-[var(--text-muted)] mt-0.5 tabular-nums">
              {selectedEntries.length === 0
                ? "No entries"
                : `${selectedEntries.length} ${selectedEntries.length === 1 ? "entry" : "entries"} · ${minutesToHHMM(selectedTotal)}`}
            </p>
          </div>

          <div className="flex-1 overflow-auto">
            {selectedEntries.length === 0 ? (
              <p className="text-xs text-[var(--text-muted)] text-center py-10">
                No time tracked this day
              </p>
            ) : (
              <div className="divide-y divide-[var(--border)]">
                {selectedEntries.map((entry) => (
                  <DayEntry
                    key={entry.id}
                    entry={entry}
                    tags={tags}
                    onUpdate={onUpdate}
                    onDelete={onDelete}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
    </div>
  );
}

function DayEntry({
  entry,
  tags,
  onUpdate,
  onDelete,
}: {
  entry: TimeEntry;
  tags: EntryTag[];
  onUpdate: (args: UpdateEntryArgs) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
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

  if (editing) {
    return (
      <div className="px-4 py-3 bg-[var(--surface-2)] space-y-2">
        <div className="flex gap-1 items-center">
          <input
            type="time"
            value={form.start_time.slice(0, 5)}
            onChange={(event) => setForm({ ...form, start_time: `${event.target.value}:00` })}
            className="flex-1 bg-[var(--surface-1)] border border-[var(--border)] rounded px-2 py-1 text-xs text-[var(--text-primary)] focus:border-[var(--brand)] focus:outline-none"
          />
          <span className="text-[var(--text-muted)] text-xs">–</span>
          <input
            type="time"
            value={form.end_time.slice(0, 5)}
            onChange={(event) => setForm({ ...form, end_time: `${event.target.value}:00` })}
            className="flex-1 bg-[var(--surface-1)] border border-[var(--border)] rounded px-2 py-1 text-xs text-[var(--text-primary)] focus:border-[var(--brand)] focus:outline-none"
          />
        </div>
        <input
          value={form.description}
          onChange={(event) => setForm({ ...form, description: event.target.value })}
          placeholder="Description"
          autoFocus
          className="w-full bg-[var(--surface-1)] border border-[var(--border)] rounded px-2 py-1 text-xs text-[var(--text-primary)] focus:border-[var(--brand)] focus:outline-none"
        />
        <TagSelect
          tags={selectableTags}
          value={form.tag_id}
          onChange={(tag_id) => setForm({ ...form, tag_id })}
          className="w-full bg-[var(--surface-1)] border border-[var(--border)] rounded px-2 py-1 text-xs text-[var(--text-primary)] focus:border-[var(--brand)] focus:outline-none"
        />
        <div className="flex gap-1 pt-0.5">
          <button
            onClick={() => setEditing(false)}
            className="flex-1 py-1 rounded text-[11px] text-[var(--text-muted)] hover:bg-[var(--surface-3)] transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 py-1 rounded bg-[var(--brand)] text-white text-[11px] font-medium disabled:opacity-50 flex items-center justify-center gap-1 transition-colors"
          >
            <Check size={11} />
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 py-3 group hover:bg-[var(--surface-2)] transition-colors">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-mono tabular-nums text-[var(--text-muted)]">
            {formatTime(entry.start_time)}
            {entry.end_time ? ` – ${formatTime(entry.end_time)}` : ""}
          </p>
          <p className="text-sm text-[var(--text-primary)] mt-0.5 leading-snug">
            {entry.description || (
              <span className="italic text-[var(--text-muted)]">No description</span>
            )}
          </p>
          <div className="flex items-center gap-1.5 mt-1">
            <TagBadge tag={entry} className="text-[11px] text-[var(--text-muted)]" />
            {entry.duration_minutes != null && (
              <>
                <span className="text-[var(--text-muted)] text-[10px]">·</span>
                <span className="text-[11px] text-[var(--text-muted)] tabular-nums">
                  {minutesToHHMM(entry.duration_minutes)}
                </span>
              </>
            )}
          </div>
        </div>

        <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
          <button
            onClick={() => setEditing(true)}
            className="p-1.5 rounded text-[var(--text-muted)] hover:bg-[var(--surface-3)] hover:text-[var(--text-primary)] transition-colors"
            title="Edit"
          >
            <Pencil size={12} />
          </button>
          <button
            onClick={() => onDelete(entry.id)}
            className="p-1.5 rounded text-[var(--text-muted)] hover:bg-[var(--danger)]/15 hover:text-[var(--danger)] transition-colors"
            title="Delete"
          >
            <Trash2 size={12} />
          </button>
        </div>
      </div>
    </div>
  );
}
