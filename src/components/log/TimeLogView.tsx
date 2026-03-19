import { useEffect, useState } from "react";
import { useEntries } from "../../hooks/useEntries";
import { useTags } from "../../hooks/useTags";
import { LogFilters } from "./LogFilters";
import { EntryRow } from "./EntryRow";
import { EntryForm } from "./EntryForm";
import { MonthView } from "./MonthView";
import { ListEntriesArgs } from "../../lib/commands";
import { minutesToHHMM, currentMonthRange } from "../../lib/dateUtils";
import { Plus, ClipboardList, ChevronLeft, ChevronRight } from "lucide-react";
import { format, addMonths, subMonths, startOfMonth, endOfMonth } from "date-fns";

type ViewMode = "list" | "month";

export function TimeLogView() {
  const { entries, loading, error, load, add, update, remove } = useEntries();
  const { tags } = useTags();
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [filters, setFilters] = useState<ListEntriesArgs>(() => {
    const { from, to } = currentMonthRange();
    return { date_from: from, date_to: to };
  });
  const [calendarMonth, setCalendarMonth] = useState(() => new Date());
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  // Load entries whenever filters or calendar month changes
  useEffect(() => {
    if (viewMode === "list") {
      load(filters);
    }
  }, [filters, viewMode]);

  useEffect(() => {
    if (viewMode === "month") {
      load({
        date_from: format(startOfMonth(calendarMonth), "yyyy-MM-dd"),
        date_to:   format(endOfMonth(calendarMonth),   "yyyy-MM-dd"),
      });
      setSelectedDay(null);
    }
  }, [calendarMonth, viewMode]);

  // Switch view modes
  const handleSetViewMode = (mode: ViewMode) => {
    setViewMode(mode);
    if (mode === "month") {
      load({
        date_from: format(startOfMonth(calendarMonth), "yyyy-MM-dd"),
        date_to:   format(endOfMonth(calendarMonth),   "yyyy-MM-dd"),
      });
      setSelectedDay(null);
    } else {
      load(filters);
    }
  };

  const totalMinutes = entries.reduce((sum, e) => sum + (e.duration_minutes ?? 0), 0);

  const dateRange =
    filters.date_from && filters.date_to
      ? `${filters.date_from} – ${filters.date_to}`
      : null;

  const goToPrevMonth = () => setCalendarMonth((m) => subMonths(m, 1));
  const goToNextMonth = () => setCalendarMonth((m) => addMonths(m, 1));
  const goToToday    = () => setCalendarMonth(new Date());

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* ── Header ── */}
      <div className="px-5 py-3 border-b border-[var(--border)] bg-[var(--surface-1)]">
        <div className="flex items-center justify-between mb-2.5">
          <div>
            <h1 className="text-[13px] font-semibold text-[var(--text-primary)]">Time Log</h1>
            {viewMode === "list" && (
              <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
                {entries.length > 0
                  ? `${entries.length} entries · ${minutesToHHMM(totalMinutes)}${dateRange ? ` · ${dateRange}` : ""}`
                  : dateRange ?? "All entries"}
              </p>
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* View toggle */}
            <div className="flex items-center gap-px bg-[var(--surface-2)] border border-[var(--border)] rounded p-0.5">
              {(["list", "month"] as ViewMode[]).map((mode) => (
                <button
                  key={mode}
                  onClick={() => handleSetViewMode(mode)}
                  className={`px-2.5 py-0.5 rounded-sm text-xs font-medium capitalize transition-all ${
                    viewMode === mode
                      ? "bg-[var(--surface-3)] text-[var(--text-primary)]"
                      : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
                  }`}
                >
                  {mode}
                </button>
              ))}
            </div>

            <button
              onClick={() => setShowForm(true)}
              className="flex items-center gap-1.5 px-3 py-1 rounded bg-[var(--brand)] hover:bg-[var(--brand-hover)] text-white text-xs font-medium transition-colors"
            >
              <Plus size={12} />
              Add Entry
            </button>
          </div>
        </div>

        {/* List mode: filters */}
        {viewMode === "list" && (
          <LogFilters filters={filters} onChange={setFilters} tags={tags} />
        )}

        {/* Month mode: month nav */}
        {viewMode === "month" && (
          <div className="flex items-center gap-1.5">
            <button
              onClick={goToPrevMonth}
              className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-2)] transition-colors"
            >
              <ChevronLeft size={14} />
            </button>
            <span className="text-xs font-medium text-[var(--text-primary)] w-32 text-center">
              {format(calendarMonth, "MMMM yyyy")}
            </span>
            <button
              onClick={goToNextMonth}
              className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-2)] transition-colors"
            >
              <ChevronRight size={14} />
            </button>
            <button
              onClick={goToToday}
              className="ml-1 px-2 py-0.5 rounded text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-2)] transition-colors border border-[var(--border)]"
            >
              Today
            </button>
          </div>
        )}
      </div>

      {/* ── Content ── */}
      {loading ? (
        <div className="flex items-center justify-center flex-1 text-[var(--text-muted)]">
          Loading…
        </div>
      ) : error ? (
        <div className="flex items-center justify-center flex-1 text-[var(--danger)]">
          {error}
        </div>
      ) : viewMode === "month" ? (
        <MonthView
          entries={entries}
          tags={tags}
          month={calendarMonth}
          selectedDay={selectedDay}
          onSelectDay={setSelectedDay}
          onUpdate={async (args) => { await update(args); }}
          onDelete={remove}
        />
      ) : entries.length === 0 ? (
        <div className="flex flex-col items-center justify-center flex-1 gap-2 text-[var(--text-muted)]">
          <ClipboardList size={36} strokeWidth={1.5} />
          <p className="text-sm">No entries found</p>
          <p className="text-xs">Adjust filters or add a manual entry</p>
        </div>
      ) : (
        <div className="flex-1 overflow-auto">
          <table className="w-full">
            <thead className="sticky top-0 bg-[var(--surface-0)] z-10 border-b border-[var(--border)]">
              <tr>
                {["Date", "Time", "Description", "Type", "Duration", ""].map((col) => (
                  <th
                    key={col}
                    className="px-4 py-2.5 text-left text-[11px] font-medium text-[var(--text-muted)] uppercase tracking-wider"
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {entries.map((entry) => (
                <EntryRow
                  key={entry.id}
                  entry={entry}
                  tags={tags}
                  onUpdate={async (args) => { await update(args); }}
                  onDelete={remove}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showForm && (
        <EntryForm
          onAdd={async (args) => { await add(args); }}
          onClose={() => setShowForm(false)}
        />
      )}
    </div>
  );
}
