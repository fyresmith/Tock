import { useEffect, useCallback, useState, useMemo } from "react";
import { listen } from "@tauri-apps/api/event";
import {
  ClipboardList,
  FileText,
  Keyboard,
  LayoutDashboard,
  Pause,
  Play,
  PlusCircle,
  Settings2,
  Square,
  Timer,
} from "lucide-react";
import { Sidebar } from "./components/layout/Sidebar";
import { CommandPalette, type CommandPaletteAction } from "./components/command/CommandPalette";
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
import { type SettingsSection, type View, APP_VIEWS } from "./lib/navigation";
import {
  DEFAULT_COMMAND_PALETTE_SHORTCUT,
  DEFAULT_QUICK_ADD_ENTRY_SHORTCUT,
  DEFAULT_STOP_TIMER_SHORTCUT,
  eventMatchesShortcut,
} from "./lib/shortcuts";

export function App() {
  const [currentView, setCurrentView] = useState<View>("timer");
  const [settingsSection, setSettingsSection] = useState<SettingsSection>("clients");
  const [showStop, setShowStop] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [manualEntryIntent, setManualEntryIntent] = useState(0);
  const { isRunning, isPaused, setActiveEntry, pause, resume } = useTimerStore();
  const { settings } = useSettings();
  useTimerSync();

  const isMac = useMemo(() => navigator.platform.toUpperCase().includes("MAC"), []);
  const commandPaletteShortcut =
    settings?.command_palette_shortcut || DEFAULT_COMMAND_PALETTE_SHORTCUT;
  const quickAddEntryShortcut =
    settings?.quick_add_entry_shortcut || DEFAULT_QUICK_ADD_ENTRY_SHORTCUT;
  const stopTimerShortcut = settings?.stop_timer_shortcut || DEFAULT_STOP_TIMER_SHORTCUT;

  useEffect(() => {
    if (settings?.theme === "light") {
      document.documentElement.classList.add("light");
    } else {
      document.documentElement.classList.remove("light");
    }
  }, [settings?.theme]);

  useEffect(() => {
    const unlisten = listen("tray-stop-requested", () => {
      setCurrentView("timer");
      setShowStop(true);
    });
    return () => { unlisten.then((f) => f()); };
  }, []);

  const openManualEntry = useCallback(() => {
    setCurrentView("log");
    setManualEntryIntent((current) => current + 1);
  }, []);

  const navigateToSettings = useCallback((section: SettingsSection) => {
    setSettingsSection(section);
    setCurrentView("settings");
  }, []);

  const commandPaletteActions = useMemo<CommandPaletteAction[]>(() => {
    const actions: CommandPaletteAction[] = [
      {
        id: "nav-timer",
        title: "Go to Timer",
        subtitle: "Jump back to the live timer screen.",
        keywords: ["home", "clock", "recording"],
        group: "Navigation",
        icon: Timer,
        perform: () => setCurrentView("timer"),
      },
      {
        id: "nav-log",
        title: "Go to Time Log",
        subtitle: "Review, filter, and edit tracked entries.",
        keywords: ["entries", "timesheet", "hours"],
        group: "Navigation",
        icon: ClipboardList,
        perform: () => setCurrentView("log"),
      },
      {
        id: "nav-dashboard",
        title: "Go to Dashboard",
        subtitle: "See billed time, earnings, and receivables.",
        keywords: ["metrics", "stats", "ar", "receivables"],
        group: "Navigation",
        icon: LayoutDashboard,
        perform: () => setCurrentView("dashboard"),
      },
      {
        id: "nav-invoices",
        title: "Go to Invoices",
        subtitle: "Create, issue, and track invoices.",
        keywords: ["billing", "gmail", "pdf"],
        group: "Navigation",
        icon: FileText,
        perform: () => setCurrentView("invoices"),
      },
      {
        id: "nav-settings",
        title: "Go to Settings",
        subtitle: "Open app settings and preferences.",
        keywords: ["preferences", "configuration"],
        group: "Navigation",
        icon: Settings2,
        perform: () => setCurrentView("settings"),
      },
      {
        id: "add-manual-entry",
        title: "Add Manual Time Entry",
        subtitle: "Open the time log and launch the manual entry form.",
        keywords: ["new entry", "quick add", "timesheet"],
        group: "Entries",
        icon: PlusCircle,
        shortcut: quickAddEntryShortcut,
        perform: openManualEntry,
      },
      {
        id: "open-shortcuts-settings",
        title: "Open Keyboard Shortcuts Settings",
        subtitle: "Customize the command palette and quick action shortcuts.",
        keywords: ["command palette", "hotkeys", "keyboard"],
        group: "Settings",
        icon: Keyboard,
        perform: () => navigateToSettings("shortcuts"),
      },
    ];

    if (!isRunning && !isPaused) {
      actions.push({
        id: "start-timer",
        title: "Start Timer",
        subtitle: "Begin tracking a new session from anywhere.",
        keywords: ["record", "clock in"],
        group: "Timer",
        icon: Play,
        perform: async () => {
          setCurrentView("timer");
          const entry = await startTimer(null);
          setActiveEntry(entry);
        },
      });
    }

    if (isRunning && !isPaused) {
      actions.push({
        id: "pause-timer",
        title: "Pause Timer",
        subtitle: "Pause the active session without stopping it.",
        keywords: ["hold", "break"],
        group: "Timer",
        icon: Pause,
        perform: () => {
          setCurrentView("timer");
          pause();
        },
      });
    }

    if (isPaused) {
      actions.push({
        id: "resume-timer",
        title: "Resume Timer",
        subtitle: "Continue the paused session.",
        keywords: ["continue", "restart"],
        group: "Timer",
        icon: Play,
        perform: () => {
          setCurrentView("timer");
          resume();
        },
      });
    }

    if (isRunning || isPaused) {
      actions.push({
        id: "stop-timer",
        title: "Stop Timer",
        subtitle: "Open the stop prompt to save the current entry.",
        keywords: ["finish", "save entry"],
        group: "Timer",
        icon: Square,
        shortcut: stopTimerShortcut,
        perform: () => {
          setCurrentView("timer");
          setShowStop(true);
        },
      });
    }

    return actions;
  }, [
    isRunning,
    isPaused,
    openManualEntry,
    navigateToSettings,
    pause,
    quickAddEntryShortcut,
    resume,
    setActiveEntry,
    stopTimerShortcut,
  ]);

  const handleKeyDown = useCallback(
    async (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && e.target.dataset.shortcutRecorder === "true") {
        return;
      }

      const inInput =
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement;

      if (eventMatchesShortcut(e, commandPaletteShortcut, isMac)) {
        e.preventDefault();
        setCommandPaletteOpen((current) => !current);
        return;
      }

      if (commandPaletteOpen) {
        if (e.key === "Escape") {
          e.preventDefault();
          setCommandPaletteOpen(false);
        }
        return;
      }

      if (eventMatchesShortcut(e, quickAddEntryShortcut, isMac)) {
        e.preventDefault();
        openManualEntry();
        return;
      }

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

      // Custom stop shortcut — open stop prompt
      if (eventMatchesShortcut(e, stopTimerShortcut, isMac) && !inInput) {
        e.preventDefault();
        if (isRunning || isPaused) {
          setCurrentView("timer");
          setShowStop(true);
        }
        return;
      }

      // Cmd/Ctrl+1-5 — navigate
      const modKey = isMac ? e.metaKey : e.ctrlKey;
      if (modKey && e.key >= "1" && e.key <= "5") {
        e.preventDefault();
        setCurrentView(APP_VIEWS[parseInt(e.key, 10) - 1]);
      }
    },
    [
      commandPaletteOpen,
      commandPaletteShortcut,
      isRunning,
      isPaused,
      openManualEntry,
      pause,
      quickAddEntryShortcut,
      resume,
      setActiveEntry,
      isMac,
      stopTimerShortcut,
    ]
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
        return <TimeLogView entryFormIntent={manualEntryIntent} />;
      case "dashboard":
        return <DashboardView />;
      case "invoices":
        return <InvoicesView />;
      case "settings":
        return (
          <SettingsView
            activeSection={settingsSection}
            onChangeSection={setSettingsSection}
          />
        );
    }
  };

  return (
    <div className="flex h-full bg-[var(--surface-0)] text-[var(--text-primary)]">
      <div className="flex flex-1 overflow-hidden">
        <Sidebar currentView={currentView} onNavigate={setCurrentView} />
        <main className="flex-1 flex flex-col overflow-hidden">{renderView()}</main>
      </div>
      <CommandPalette
        open={commandPaletteOpen}
        actions={commandPaletteActions}
        isMac={isMac}
        onClose={() => setCommandPaletteOpen(false)}
      />
      {showStop && <StopPrompt onClose={() => setShowStop(false)} />}
    </div>
  );
}

export default App;
