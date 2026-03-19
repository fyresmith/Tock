import { useState, useRef, useEffect } from "react";
import { EntryTag, ListEntriesArgs } from "../../lib/commands";
import { currentMonthRange, formatDate } from "../../lib/dateUtils";
import { TagBadge } from "../tags/TagBadge";
import { CalendarDays, Search, X } from "lucide-react";
import { DateRangePicker } from "../invoices/DateRangePicker";

interface LogFiltersProps {
  filters: ListEntriesArgs;
  onChange: (filters: ListEntriesArgs) => void;
  tags: EntryTag[];
}

export function LogFilters({ filters, onChange, tags }: LogFiltersProps) {
  const [showPicker, setShowPicker] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  const update = (key: keyof ListEntriesArgs, value: string | boolean | undefined) =>
    onChange({ ...filters, [key]: value });

  const activeTag = filters.tag_id ?? "";
  const activeInvoiced = filters.invoiced === undefined ? "all" : filters.invoiced ? "invoiced" : "uninvoiced";
  const activeTags = tags.filter((tag) => !tag.is_archived);

  const hasDateRange = !!(filters.date_from || filters.date_to);
  const dateLabel =
    filters.date_from && filters.date_to
      ? `${formatDate(filters.date_from)} – ${formatDate(filters.date_to)}`
      : filters.date_from
      ? `From ${formatDate(filters.date_from)}`
      : filters.date_to
      ? `Until ${formatDate(filters.date_to)}`
      : "Date range";

  // Close picker on outside click
  useEffect(() => {
    if (!showPicker) return;
    const handler = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setShowPicker(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showPicker]);

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {/* Date range picker pill */}
      <div className="relative" ref={pickerRef}>
        <button
          onClick={() => setShowPicker((v) => !v)}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded border text-xs transition-all ${
            hasDateRange || showPicker
              ? "border-[var(--brand)] bg-[var(--brand-muted)] text-[var(--brand)]"
              : "bg-[var(--surface-2)] border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]"
          }`}
        >
          <CalendarDays size={13} className="flex-shrink-0" />
          <span className="font-medium">{dateLabel}</span>
          {hasDateRange && (
            <span
              onClick={(e) => {
                e.stopPropagation();
                onChange({ ...filters, date_from: undefined, date_to: undefined });
                setShowPicker(false);
              }}
              className="ml-0.5 rounded-full hover:bg-[var(--brand)]/20 p-0.5 -mr-0.5 cursor-pointer"
            >
              <X size={11} />
            </span>
          )}
        </button>

        {showPicker && (
          <div className="absolute left-0 top-full mt-1.5 z-50 bg-[var(--surface-1)] border border-[var(--border-strong)] rounded shadow-xl p-4 w-72">
            <DateRangePicker
              startDate={filters.date_from ?? ""}
              endDate={filters.date_to ?? ""}
              onChange={(s, e) => {
                onChange({ ...filters, date_from: s, date_to: e });
              }}
            />
            <div className="flex items-center justify-between mt-3 pt-3 border-t border-[var(--border)]">
              <button
                onClick={() => {
                  const { from, to } = currentMonthRange();
                  onChange({ ...filters, date_from: from, date_to: to });
                  setShowPicker(false);
                }}
                className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
              >
                This month
              </button>
              <button
                onClick={() => setShowPicker(false)}
                className="text-xs font-medium text-[var(--brand)] hover:opacity-80 transition-opacity"
              >
                Done
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Search */}
      <div className="relative">
        <Search
          size={13}
          className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)] pointer-events-none"
        />
        <input
          type="text"
          value={filters.search ?? ""}
          onChange={(e) => update("search", e.target.value || undefined)}
          placeholder="Search…"
          className="bg-[var(--surface-2)] border border-[var(--border)] rounded pl-8 pr-3 py-1.5 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--brand)] focus:outline-none w-36"
        />
      </div>

      {/* Type pills */}
      <div className="flex items-center gap-1">
        {[null, ...activeTags].map((tag) => {
          const active = activeTag === (tag?.id ?? "");
          return (
            <button
              key={tag?.id ?? "all"}
              onClick={() => update("tag_id", tag?.id)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium border transition-all ${
                active
                  ? "border-[var(--brand)] bg-[var(--brand-muted)] text-[var(--brand)]"
                  : "border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]"
              }`}
            >
              {tag ? <TagBadge tag={tag} /> : "All"}
            </button>
          );
        })}
      </div>

      {/* Invoiced pills */}
      <div className="flex items-center gap-1">
        {([
          { key: "all", label: "All" },
          { key: "uninvoiced", label: "Uninvoiced" },
        ] as const).map(({ key, label }) => {
          const active = activeInvoiced === key;
          return (
            <button
              key={key}
              onClick={() => update("invoiced", key === "all" ? undefined : false)}
              className={`px-2.5 py-1 rounded text-xs font-medium border transition-all ${
                active
                  ? "border-[var(--brand)] bg-[var(--brand-muted)] text-[var(--brand)]"
                  : "border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]"
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>

      <button
        onClick={() => onChange({})}
        className="px-2.5 py-1 text-xs text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors"
      >
        Clear
      </button>
    </div>
  );
}
