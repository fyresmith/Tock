import { useEffect, useCallback, useState, useMemo } from "react";
import { listen } from "@tauri-apps/api/event";
import { Pause, Play } from "lucide-react";
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
import { type SettingsSection, type View } from "./lib/navigation";
import {
  SHORTCUT_DEFINITIONS,
  getDefaultShortcutBindings,
  normalizeShortcutBindings,
  type ShortcutActionId,
} from "./lib/shortcutRegistry";
import { eventMatchesShortcut, isEditableTarget } from "./lib/shortcuts";

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
  const shortcutBindings = useMemo(
    () =>
      settings?.shortcut_bindings
        ? normalizeShortcutBindings(settings.shortcut_bindings)
        : getDefaultShortcutBindings(),
    [settings?.shortcut_bindings],
  );

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

  const toggleTimer = useCallback(async () => {
    setCurrentView("timer");
    if (isPaused) {
      resume();
      return true;
    }
    if (isRunning) {
      pause();
      return true;
    }
    const entry = await startTimer(null);
    setActiveEntry(entry);
    return true;
  }, [isPaused, isRunning, pause, resume, setActiveEntry]);

  const openStopPrompt = useCallback(() => {
    if (!isRunning && !isPaused) {
      return false;
    }
    setCurrentView("timer");
    setShowStop(true);
    return true;
  }, [isPaused, isRunning]);

  const isShortcutActionAvailable = useCallback(
    (actionId: ShortcutActionId) => {
      switch (actionId) {
        case "stop-timer":
          return isRunning || isPaused;
        default:
          return true;
      }
    },
    [isPaused, isRunning],
  );

  const runShortcutAction = useCallback(
    async (actionId: ShortcutActionId) => {
      switch (actionId) {
        case "open-command-palette":
          setCommandPaletteOpen((current) => !current);
          return true;
        case "toggle-timer":
          return toggleTimer();
        case "stop-timer":
          return openStopPrompt();
        case "open-manual-entry":
          openManualEntry();
          return true;
        case "go-to-timer":
          setCurrentView("timer");
          return true;
        case "go-to-log":
          setCurrentView("log");
          return true;
        case "go-to-dashboard":
          setCurrentView("dashboard");
          return true;
        case "go-to-invoices":
          setCurrentView("invoices");
          return true;
        case "go-to-settings":
          setCurrentView("settings");
          return true;
        case "open-shortcuts-settings":
          navigateToSettings("shortcuts");
          return true;
        default:
          return false;
      }
    },
    [navigateToSettings, openManualEntry, openStopPrompt, toggleTimer],
  );

  const commandPaletteActions = useMemo<CommandPaletteAction[]>(() => {
    const actions: CommandPaletteAction[] = [];

    for (const definition of SHORTCUT_DEFINITIONS) {
      if (definition.id === "open-command-palette") {
        continue;
      }

      if (!isShortcutActionAvailable(definition.id)) {
        continue;
      }

      if (definition.id === "toggle-timer") {
        const title = !isRunning && !isPaused ? "Start Timer" : isPaused ? "Resume Timer" : "Pause Timer";
        const subtitle = !isRunning && !isPaused
          ? "Begin tracking a new session from anywhere."
          : isPaused
            ? "Continue the paused session."
            : "Pause the active session without stopping it.";
        const icon = !isRunning && !isPaused ? Play : isPaused ? Play : Pause;

        actions.push({
          id: definition.id,
          title,
          subtitle,
          keywords: definition.keywords,
          group: definition.group,
          icon,
          shortcut: shortcutBindings[definition.id],
          perform: async () => {
            await runShortcutAction(definition.id);
          },
        });
        continue;
      }

      actions.push({
        id: definition.id,
        title: definition.title,
        subtitle: definition.description,
        keywords: definition.keywords,
        group: definition.group,
        icon: definition.icon,
        shortcut: shortcutBindings[definition.id],
        perform: async () => {
          await runShortcutAction(definition.id);
        },
      });
    }

    return actions;
  }, [
    isRunning,
    isPaused,
    isShortcutActionAvailable,
    runShortcutAction,
    shortcutBindings,
  ]);

  const handleKeyDown = useCallback(
    async (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && e.target.dataset.shortcutRecorder === "true") {
        return;
      }

      const inInput = isEditableTarget(e.target);
      const matchedDefinition = SHORTCUT_DEFINITIONS.find((definition) => {
        const binding = shortcutBindings[definition.id];
        if (!binding) return false;
        if (inInput && !definition.firesWhileEditing) return false;
        return eventMatchesShortcut(e, binding, isMac);
      });

      if (matchedDefinition?.id === "open-command-palette") {
        e.preventDefault();
        await runShortcutAction("open-command-palette");
        return;
      }

      if (commandPaletteOpen) {
        if (e.key === "Escape") {
          e.preventDefault();
          setCommandPaletteOpen(false);
        }
        return;
      }

      if (!matchedDefinition || !isShortcutActionAvailable(matchedDefinition.id)) {
        return;
      }

      const handled = await runShortcutAction(matchedDefinition.id);
      if (handled) {
        e.preventDefault();
      }
    },
    [
      commandPaletteOpen,
      isShortcutActionAvailable,
      isMac,
      runShortcutAction,
      shortcutBindings,
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
