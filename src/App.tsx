import { useEffect, useCallback, useState, useMemo } from "react";
import { Sidebar } from "./components/layout/Sidebar";
import { TimerView } from "./components/timer/TimerView";
import { TimeLogView } from "./components/log/TimeLogView";
import { DashboardView } from "./components/dashboard/DashboardView";
import { InvoicesView } from "./components/invoices/InvoicesView";
import { SettingsView } from "./components/settings/SettingsView";
import { StopPrompt } from "./components/timer/StopPrompt";
import { useTimerStore } from "./stores/timerStore";
import { useSettings } from "./hooks/useSettings";
import { useTimerSync } from "./hooks/useTimerSync";
import { startTimer } from "./lib/commands";

type View = "timer" | "log" | "dashboard" | "invoices" | "settings";

const VIEWS: View[] = ["timer", "log", "dashboard", "invoices", "settings"];

export function App() {
  const [currentView, setCurrentView] = useState<View>("timer");
  const [showStop, setShowStop] = useState(false);
  const { isRunning, isPaused, setActiveEntry, pause, resume } = useTimerStore();
  const { settings } = useSettings();
  useTimerSync();

  const isMac = useMemo(() => navigator.platform.toUpperCase().includes("MAC"), []);

  useEffect(() => {
    if (settings?.theme === "light") {
      document.documentElement.classList.add("light");
    } else {
      document.documentElement.classList.remove("light");
    }
  }, [settings?.theme]);

  const handleKeyDown = useCallback(
    async (e: KeyboardEvent) => {
      const modKey = isMac ? e.metaKey : e.ctrlKey;
      const inInput =
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement;

      // Space — start / pause / resume (never in inputs)
      if (e.code === "Space" && !inInput && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        if (isPaused) {
          resume();
        } else if (isRunning) {
          pause();
        } else {
          setCurrentView("timer");
          const entry = await startTimer(null);
          setActiveEntry(entry);
        }
      }

      // Cmd/Ctrl+Enter — stop (open stop prompt)
      if (e.code === "Enter" && modKey && !inInput) {
        e.preventDefault();
        if (isRunning || isPaused) setShowStop(true);
      }

      // Cmd/Ctrl+1-5 — navigate
      if (modKey && e.key >= "1" && e.key <= "5") {
        e.preventDefault();
        setCurrentView(VIEWS[parseInt(e.key) - 1]);
      }
    },
    [isRunning, isPaused, pause, resume, setActiveEntry, isMac]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  const renderView = () => {
    switch (currentView) {
      case "timer":
        return <TimerView />;
      case "log":
        return <TimeLogView />;
      case "dashboard":
        return <DashboardView />;
      case "invoices":
        return <InvoicesView />;
      case "settings":
        return <SettingsView />;
    }
  };

  return (
    <div className="flex h-full bg-[var(--surface-0)] text-[var(--text-primary)]">
      <div className="flex flex-1 overflow-hidden">
        <Sidebar currentView={currentView} onNavigate={setCurrentView} />
        <main className="flex-1 flex flex-col overflow-hidden">{renderView()}</main>
      </div>
      {showStop && <StopPrompt onClose={() => setShowStop(false)} />}
    </div>
  );
}

export default App;
