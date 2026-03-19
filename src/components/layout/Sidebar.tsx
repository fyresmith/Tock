import { useTimerStore } from "../../stores/timerStore";
import { secondsToHHMMSS, elapsedSeconds } from "../../lib/dateUtils";
import { useEffect, useState } from "react";
import { Timer, ClipboardList, LayoutDashboard, FileText, Settings } from "lucide-react";

type View = "timer" | "log" | "dashboard" | "invoices" | "settings";

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

  return (
    <aside className="w-48 flex-shrink-0 flex flex-col border-r border-[var(--border)] bg-[var(--surface-1)] shadow-[2px_0_8px_rgba(0,0,0,0.18)]" style={{ zIndex: 20 }}>
      {/* Active timer indicator */}
      {(isRunning || isPaused) && activeEntry && (
        <div className="mx-2 mt-2 px-3 py-2 rounded bg-[var(--brand-muted)] border border-[var(--brand-muted-border)]">
          <div className="flex items-center gap-1.5 mb-0.5">
            {isPaused ? (
              <>
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--text-muted)]" />
                <span className="text-[9px] font-semibold tracking-widest uppercase text-[var(--text-muted)]">
                  Paused
                </span>
              </>
            ) : (
              <>
                <span
                  className="w-1.5 h-1.5 rounded-full bg-[var(--brand)]"
                  style={{ animation: "pulse-dot 1.5s ease-in-out infinite" }}
                />
                <span className="text-[9px] font-semibold tracking-widest uppercase text-[var(--brand)]">
                  Recording
                </span>
              </>
            )}
          </div>
          <div className="font-mono text-sm font-semibold text-[var(--text-primary)] tabular-nums">
            {secondsToHHMMSS(elapsed)}
          </div>
        </div>
      )}

      {/* Nav */}
      <nav className="flex-1 px-2 pt-1.5 pb-2 space-y-px">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = currentView === item.id;
          return (
            <button
              key={item.id}
              tabIndex={-1}
              onClick={() => onNavigate(item.id)}
              className={`relative w-full flex items-center gap-2.5 px-3 py-1.5 rounded text-[13px] font-medium transition-colors text-left ${
                active
                  ? "bg-[var(--surface-3)] text-[var(--text-primary)]"
                  : "text-[var(--text-secondary)] hover:bg-[var(--surface-2)] hover:text-[var(--text-primary)]"
              }`}
            >
              {active && (
                <span className="absolute left-0 top-1 bottom-1 w-0.5 rounded-sm bg-[var(--brand)]" />
              )}
              <Icon size={14} strokeWidth={active ? 2 : 1.75} />
              {item.label}
            </button>
          );
        })}
      </nav>

      {/* Bottom */}
      <div className="px-3 py-2.5 border-t border-[var(--border)]">
        <p className="text-[10px] text-[var(--text-muted)]">Tock v0.1.0</p>
      </div>
    </aside>
  );
}
