import { useState, useMemo } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

// Returns first and last workday (Mon–Sat) of the given month.
// month is 0-indexed (0 = January, 11 = December).
export function workdayRange(year: number, month: number): [string, string] {
  const pad = (n: number) => String(n).padStart(2, "0");
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  let first = 1;
  while (new Date(year, month, first).getDay() === 0) first++; // skip Sundays

  let last = daysInMonth;
  while (new Date(year, month, last).getDay() === 0) last--; // skip Sundays

  return [
    `${year}-${pad(month + 1)}-${pad(first)}`,
    `${year}-${pad(month + 1)}-${pad(last)}`,
  ];
}

interface Props {
  startDate: string; // "YYYY-MM-DD"
  endDate: string;   // "YYYY-MM-DD"
  onChange: (start: string, end: string) => void;
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const DAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];


export function DateRangePicker({ startDate, endDate, onChange }: Props) {
  const today = new Date();
  const [viewYear, setViewYear] = useState(() =>
    startDate ? parseInt(startDate.slice(0, 4)) : today.getFullYear()
  );
  const [viewMonth, setViewMonth] = useState(() =>
    startDate ? parseInt(startDate.slice(5, 7)) - 1 : today.getMonth()
  );
  // "end" = user has clicked a start date and is picking the end
  const [picking, setPicking] = useState<"end" | null>(null);
  const [anchorDate, setAnchorDate] = useState<string | null>(null);
  const [hoverDate, setHoverDate] = useState<string | null>(null);

  // Calendar grid for the current view month
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

  // Range to display — uses hover preview while picking
  const [dispStart, dispEnd] = useMemo((): [string, string] => {
    if (picking === "end" && anchorDate && hoverDate) {
      return hoverDate >= anchorDate
        ? [anchorDate, hoverDate]
        : [hoverDate, anchorDate];
    }
    return [startDate, endDate];
  }, [picking, anchorDate, hoverDate, startDate, endDate]);

  const handleDayClick = (date: string) => {
    if (picking === null) {
      setAnchorDate(date);
      onChange(date, date);
      setPicking("end");
    } else {
      const [a, b] = anchorDate! <= date
        ? [anchorDate!, date]
        : [date, anchorDate!];
      onChange(a, b);
      setPicking(null);
      setAnchorDate(null);
      setHoverDate(null);
    }
  };

  const prevMonth = () => {
    if (viewMonth === 0) { setViewYear((y) => y - 1); setViewMonth(11); }
    else setViewMonth((m) => m - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewYear((y) => y + 1); setViewMonth(0); }
    else setViewMonth((m) => m + 1);
  };

  // Clicking the month/year label auto-fills the workday range for that month
  const handleMonthClick = () => {
    const [s, e] = workdayRange(viewYear, viewMonth);
    onChange(s, e);
    setPicking(null);
    setAnchorDate(null);
    setHoverDate(null);
  };

  return (
    <div className="select-none">
      {/* Month navigation */}
      <div className="flex items-center justify-between mb-2">
        <button
          onClick={prevMonth}
          className="p-1 rounded hover:bg-[var(--surface-3)] text-[var(--text-muted)] transition-colors"
        >
          <ChevronLeft size={15} />
        </button>
        <button
          onClick={handleMonthClick}
          className="text-sm font-semibold text-[var(--text-primary)] hover:text-[var(--brand)] transition-colors"
          title="Click to auto-fill workday range (Mon–Sat) for this month"
        >
          {MONTHS[viewMonth]} {viewYear}
        </button>
        <button
          onClick={nextMonth}
          className="p-1 rounded hover:bg-[var(--surface-3)] text-[var(--text-muted)] transition-colors"
        >
          <ChevronRight size={15} />
        </button>
      </div>

      {/* Day-of-week headers */}
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
          if (!date) return <div key={`pad-${i}`} className="h-8" />;

          const isStart = !!(dispStart && date === dispStart);
          const isEnd = !!(dispEnd && date === dispEnd);
          const isSingle = !!(dispStart && dispEnd && dispStart === dispEnd);
          const inRange = !!(
            dispStart && dispEnd && !isSingle &&
            date > dispStart && date < dispEnd
          );

          const showBand = !isSingle && (isStart || isEnd || inRange);

          return (
            <div
              key={date}
              className="h-8 relative"
              onMouseEnter={() => picking === "end" && setHoverDate(date)}
              onMouseLeave={() => picking === "end" && setHoverDate(null)}
            >
              {/* Range band — separate layer so it doesn't interfere with button shape */}
              {showBand && (
                <div
                  className="absolute top-1 bottom-1 bg-[var(--brand-muted-border)]"
                  style={{
                    left: isStart ? "50%" : "0",
                    right: isEnd ? "50%" : "0",
                  }}
                />
              )}
              <button
                onClick={() => handleDayClick(date)}
                className={`absolute inset-0.5 z-10 flex items-center justify-center rounded-sm text-xs font-medium transition-colors ${
                  isStart || isEnd
                    ? "bg-[var(--brand)] text-white"
                    : inRange
                    ? "text-[var(--text-primary)] hover:bg-[var(--brand-muted)]"
                    : "text-[var(--text-secondary)] hover:bg-[var(--surface-3)]"
                }`}
              >
                {parseInt(date.slice(8))}
              </button>
            </div>
          );
        })}
      </div>

      {/* Hint line */}
      <p className="mt-2 text-[10px] text-center text-[var(--text-muted)]">
        {picking === "end"
          ? "Now click an end date"
          : "Click month name to auto-fill workdays"}
      </p>
    </div>
  );
}
