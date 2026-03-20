import { useState, useRef, useEffect } from "react";
import { Client, EntryTag, ListEntriesArgs } from "../../lib/commands";
import { currentMonthRange, formatDate } from "../../lib/dateUtils";
import { TagBadge } from "../tags/TagBadge";
import { CalendarDays, Search, X } from "lucide-react";
import { Select } from "../ui/Select";
import { DateRangePicker } from "../invoices/DateRangePicker";

interface LogFiltersProps {
  filters: ListEntriesArgs;
  onChange: (filters: ListEntriesArgs) => void;
  tags: EntryTag[];
  clients: Client[];
}

export function LogFilters({ filters, onChange, tags, clients }: LogFiltersProps) {
  const [showPicker, setShowPicker] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  const update = (key: keyof ListEntriesArgs, value: string | boolean | undefined) =>
    onChange({ ...filters, [key]: value });

  const activeTag = filters.tag_id ?? "";
  const activeClient = filters.client_id === undefined ? "__all__" : filters.client_id === "" ? "__none__" : filters.client_id;
  const activeInvoiced = filters.invoiced === undefined ? "all" : filters.invoiced ? "invoiced" : "uninvoiced";
  const activeBillable = filters.billable === undefined ? "all" : filters.billable ? "billable" : "non-billable";
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

  const sep = <div className="w-px h-4 bg-[var(--border-strong)] flex-shrink-0" />;

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {/* Search */}
      <div className="relative">
        <Search
          size={12}
          className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)] pointer-events-none"
        />
        <input
          type="text"
          value={filters.search ?? ""}
          onChange={(e) => update("search", e.target.value || undefined)}
          placeholder="Search…"
          className="bg-[var(--surface-2)] border border-[var(--border)] rounded pl-7 pr-3 py-1.5 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--brand)] focus:outline-none w-32"
        />
      </div>

      {/* Date range picker */}
      <div className="relative" ref={pickerRef}>
        <button
          onClick={() => setShowPicker((v) => !v)}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded border text-xs transition-all ${
            hasDateRange || showPicker
              ? "border-[var(--brand)] bg-[var(--brand-muted)] text-[var(--brand)]"
              : "bg-[var(--surface-2)] border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]"
          }`}
        >
          <CalendarDays size={12} className="flex-shrink-0" />
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
              <X size={10} />
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

      {/* Client */}
      <Select
        value={activeClient}
        onChange={(v) =>
          onChange({
            ...filters,
            client_id: v === "__all__" ? undefined : v === "__none__" ? "" : v,
          })
        }
        options={[
          { value: "__all__", label: "Any client" },
          { value: "__none__", label: "No client" },
          ...clients.map((c) => ({
            value: c.id,
            label: c.name + (c.is_archived ? " (archived)" : ""),
          })),
        ]}
        className="bg-[var(--surface-2)] border border-[var(--border)] rounded px-2.5 py-1.5 text-xs font-medium text-[var(--text-secondary)] focus:border-[var(--brand)] focus:outline-none"
      />

      {sep}

      {/* Tag pills */}
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

      {sep}

      {/* Invoiced + Billable pills */}
      <div className="flex items-center gap-1">
        <button
          onClick={() => update("invoiced", activeInvoiced === "uninvoiced" ? undefined : false)}
          className={`px-2.5 py-1 rounded text-xs font-medium border transition-all ${
            activeInvoiced === "uninvoiced"
              ? "border-[var(--brand)] bg-[var(--brand-muted)] text-[var(--brand)]"
              : "border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]"
          }`}
        >
          Uninvoiced
        </button>
        <button
          onClick={() => onChange({ ...filters, billable: activeBillable === "billable" ? undefined : true })}
          className={`px-2.5 py-1 rounded text-xs font-medium border transition-all ${
            activeBillable === "billable"
              ? "border-[var(--brand)] bg-[var(--brand-muted)] text-[var(--brand)]"
              : "border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]"
          }`}
        >
          Billable
        </button>
        <button
          onClick={() => onChange({ ...filters, billable: activeBillable === "non-billable" ? undefined : false })}
          className={`px-2.5 py-1 rounded text-xs font-medium border transition-all ${
            activeBillable === "non-billable"
              ? "border-[var(--brand)] bg-[var(--brand-muted)] text-[var(--brand)]"
              : "border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]"
          }`}
        >
          Non-billable
        </button>
      </div>

      <button
        onClick={() => onChange({})}
        className="ml-auto px-2.5 py-1 text-xs text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors"
      >
        Clear
      </button>
    </div>
  );
}
