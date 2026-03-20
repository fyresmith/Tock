import { useTimerStore } from "../../stores/timerStore";
import { secondsToHHMMSS, elapsedSeconds } from "../../lib/dateUtils";
import { useEffect, useState } from "react";
import { Timer, ClipboardList, LayoutDashboard, FileText, Settings } from "lucide-react";
import { type View } from "../../lib/navigation";

interface SidebarProps {
  currentView: View;
  onNavigate: (view: View) => void;
}

const navItems: { id: View; label: string; icon: React.ElementType }[] = [
  { id: "timer",     label: "Timer",     icon: Timer },
  { id: "log",       label: "Time Log",  icon: ClipboardList },
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "invoices",  label: "Invoices",  icon: FileText },
  { id: "settings",  label: "Settings",  icon: Settings },
];

export function Sidebar({ currentView, onNavigate }: SidebarProps) {
  const { activeEntry, isRunning, isPaused, pauseOffset, pausedSince } = useTimerStore();
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!activeEntry || (!isRunning && !isPaused)) {
      setElapsed(0);
      return;
    }
    if (isPaused) {
      setElapsed(elapsedSeconds(activeEntry.start_time, activeEntry.date, pauseOffset, pausedSince ?? undefined));
      return;
    }
    const interval = setInterval(() => {
      setElapsed(elapsedSeconds(activeEntry.start_time, activeEntry.date, pauseOffset));
    }, 1000);
    return () => clearInterval(interval);
  }, [isRunning, isPaused, activeEntry, pauseOffset, pausedSince]);

  const timerActive = (isRunning || isPaused) && activeEntry;

  return (
    <aside className="w-12 flex-shrink-0 flex flex-col border-r border-[var(--border)] bg-[var(--surface-1)]" style={{ zIndex: 20 }}>
      <nav className="flex-1 flex flex-col items-center pt-2 pb-2 gap-px">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = currentView === item.id;
          const isTimer = item.id === "timer";
          return (
            <div key={item.id} className="relative group flex justify-center w-full">
              {/* Active indicator on left edge */}
              {active && (
                <span className="absolute left-1 top-1.5 bottom-1.5 w-0.5 rounded-sm bg-[var(--brand)]" />
              )}

              <button
                tabIndex={-1}
                onClick={() => onNavigate(item.id)}
                className={`relative flex items-center justify-center w-9 h-9 rounded transition-colors ${
                  active
                    ? "bg-[var(--surface-3)] text-[var(--text-primary)]"
                    : "text-[var(--text-secondary)] hover:bg-[var(--surface-2)] hover:text-[var(--text-primary)]"
                }`}
              >
                <Icon size={16} strokeWidth={active ? 2 : 1.75} />

                {/* Timer status badge */}
                {isTimer && timerActive && (
                  <span
                    className={`absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full ${isPaused ? "bg-[var(--text-muted)]" : "bg-[var(--brand)]"}`}
                    style={!isPaused ? { animation: "pulse-dot 1.5s ease-in-out infinite" } : undefined}
                  />
                )}
              </button>

              {/* Tooltip */}
              <div className="pointer-events-none absolute left-full ml-2 top-1/2 -translate-y-1/2 z-50 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                <div className="bg-[var(--surface-3)] border border-[var(--border-strong)] rounded px-2 py-1 text-[11px] font-medium text-[var(--text-primary)] whitespace-nowrap shadow-lg">
                  {item.label}
                  {isTimer && timerActive && (
                    <span className="ml-2 font-mono tabular-nums text-[var(--text-muted)]">
                      {secondsToHHMMSS(elapsed)}
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </nav>
    </aside>
  );
}
