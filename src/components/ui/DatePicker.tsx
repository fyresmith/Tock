import { useState, useRef, useEffect, useMemo } from "react";
import { ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";
import { formatDate } from "../../lib/dateUtils";

interface DatePickerProps {
  value: string;        // "YYYY-MM-DD"
  onChange: (date: string) => void;
  className?: string;
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const DAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

export function DatePicker({ value, onChange, className = "" }: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const [viewYear, setViewYear] = useState(() =>
    value ? parseInt(value.slice(0, 4)) : new Date().getFullYear()
  );
  const [viewMonth, setViewMonth] = useState(() =>
    value ? parseInt(value.slice(5, 7)) - 1 : new Date().getMonth()
  );

  // Sync view to value when it changes externally
  useEffect(() => {
    if (value) {
      setViewYear(parseInt(value.slice(0, 4)));
      setViewMonth(parseInt(value.slice(5, 7)) - 1);
    }
  }, [value]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const grid = useMemo(() => {
    const firstDow = new Date(viewYear, viewMonth, 1).getDay();
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const pad = (n: number) => String(n).padStart(2, "0");
    const cells: (string | null)[] = [];
    for (let i = 0; i < firstDow; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push(`${viewYear}-${pad(viewMonth + 1)}-${pad(d)}`);
    }
    return cells;
  }, [viewYear, viewMonth]);

  const prevMonth = () => {
    if (viewMonth === 0) { setViewYear((y) => y - 1); setViewMonth(11); }
    else setViewMonth((m) => m - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewYear((y) => y + 1); setViewMonth(0); }
    else setViewMonth((m) => m + 1);
  };

  const handleSelect = (date: string) => {
    onChange(date);
    setOpen(false);
  };

  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  return (
    <div ref={ref} className={`relative ${className}`}>
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 rounded border border-[var(--border)] bg-[var(--surface-1)] px-3 py-2 text-sm text-left transition-colors hover:border-[var(--border-strong)] focus:border-[var(--brand)] focus:outline-none"
      >
        <CalendarDays size={13} className="text-[var(--text-muted)] flex-shrink-0" />
        <span className={value ? "text-[var(--text-primary)]" : "text-[var(--text-muted)]"}>
          {value ? formatDate(value) : "Pick a date"}
        </span>
      </button>

      {/* Popover */}
      {open && (
        <div className="absolute left-0 top-full mt-1 z-50 w-64 rounded border border-[var(--border-strong)] bg-[var(--surface-1)] shadow-xl p-3 animate-fade-in">
          {/* Month navigation */}
          <div className="flex items-center justify-between mb-2">
            <button
              type="button"
              onClick={prevMonth}
              className="p-1 rounded text-[var(--text-muted)] hover:bg-[var(--surface-3)] hover:text-[var(--text-primary)] transition-colors"
            >
              <ChevronLeft size={14} />
            </button>
            <span className="text-xs font-semibold text-[var(--text-primary)]">
              {MONTHS[viewMonth]} {viewYear}
            </span>
            <button
              type="button"
              onClick={nextMonth}
              className="p-1 rounded text-[var(--text-muted)] hover:bg-[var(--surface-3)] hover:text-[var(--text-primary)] transition-colors"
            >
              <ChevronRight size={14} />
            </button>
          </div>

          {/* Day headers */}
          <div className="grid grid-cols-7 mb-0.5">
            {DAYS.map((d) => (
              <div key={d} className="text-center text-[10px] text-[var(--text-muted)] py-1">
                {d}
              </div>
            ))}
          </div>

          {/* Calendar cells */}
          <div className="grid grid-cols-7">
            {grid.map((date, i) => {
              if (!date) return <div key={`pad-${i}`} className="h-7" />;
              const isSelected = date === value;
              const isToday = date === todayStr;
              return (
                <div key={date} className="h-7 relative">
                  <button
                    type="button"
                    onClick={() => handleSelect(date)}
                    className={`absolute inset-0.5 flex items-center justify-center rounded-sm text-xs font-medium transition-colors ${
                      isSelected
                        ? "bg-[var(--brand)] text-white"
                        : isToday
                        ? "border border-[var(--brand)] text-[var(--brand)] hover:bg-[var(--brand-muted)]"
                        : "text-[var(--text-secondary)] hover:bg-[var(--surface-3)] hover:text-[var(--text-primary)]"
                    }`}
                  >
                    {parseInt(date.slice(8))}
                  </button>
                </div>
              );
            })}
          </div>

          {/* Today shortcut */}
          <div className="mt-2 pt-2 border-t border-[var(--border)] flex justify-end">
            <button
              type="button"
              onClick={() => handleSelect(todayStr)}
              className="text-[10px] font-medium text-[var(--brand)] hover:opacity-75 transition-opacity"
            >
              Today
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
