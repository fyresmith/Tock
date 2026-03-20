import { useEffect, useMemo, useState } from "react";
import { useTimer } from "../../hooks/useTimer";
import { useClients } from "../../hooks/useClients";
import { useSettings } from "../../hooks/useSettings";
import { elapsedSeconds, secondsToHHMMSS, formatTime } from "../../lib/dateUtils";
import { isMacPlatform } from "../../lib/platform";
import { formatShortcut } from "../../lib/shortcuts";
import { getDefaultShortcutBindings, normalizeShortcutBindings } from "../../lib/shortcutRegistry";
import { Play, Square } from "lucide-react";
import { Select } from "../ui/Select";

interface TimerViewProps {
  onRequestStop: () => void;
}

export function TimerView({ onRequestStop }: TimerViewProps) {
  const { activeEntry, isRunning, start, recover } = useTimer();
  const { activeClients, defaultClient } = useClients();
  const { settings } = useSettings();
  const [elapsed, setElapsed] = useState(0);
  const [recovering, setRecovering] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);

  const isMac = useMemo(() => isMacPlatform(), []);
  const shortcutBindings = useMemo(
    () =>
      settings?.shortcut_bindings
        ? normalizeShortcutBindings(settings.shortcut_bindings)
        : getDefaultShortcutBindings(),
    [settings?.shortcut_bindings],
  );
  const toggleShortcut = shortcutBindings["toggle-timer"] ?? "";

  // Track selected client — default to the default client when clients load
  useEffect(() => {
    if (selectedClientId === null && defaultClient) {
      setSelectedClientId(defaultClient.id);
    }
  }, [defaultClient, selectedClientId]);

  // Crash recovery on mount
  useEffect(() => {
    (async () => {
      setRecovering(true);
      await recover();
      setRecovering(false);
    })();
  }, [recover]);

  // Live timer
  useEffect(() => {
    if (!activeEntry || !isRunning) {
      setElapsed(0);
      return;
    }
    const tick = () => setElapsed(elapsedSeconds(activeEntry.start_time, activeEntry.date));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [isRunning, activeEntry]);

  if (recovering) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-[var(--text-muted)]">Checking for active session…</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-10 p-8 relative overflow-hidden">
      {/* Clock */}
      <div className="text-center flex flex-col items-center gap-3">
        <div className="flex items-center justify-center gap-1.5 h-4">
          {isRunning ? (
            <>
              <span
                className="w-1.5 h-1.5 rounded-full bg-[var(--brand)]"
                style={{ animation: "pulse-dot 1.5s ease-in-out infinite" }}
              />
              <span className="text-[10px] font-semibold tracking-widest uppercase text-[var(--brand)]">
                Recording
              </span>
            </>
          ) : (
            <span className="text-[10px] text-[var(--text-muted)] tracking-widest uppercase">
              Ready
            </span>
          )}
        </div>

        <div
          className="font-mono font-bold tabular-nums text-[var(--text-primary)]"
          style={{ fontSize: "5.5rem", letterSpacing: "-0.04em", lineHeight: 1 }}
        >
          {secondsToHHMMSS(elapsed)}
        </div>

        <div className="h-4 flex items-center justify-center">
          {activeEntry ? (
            <p className="text-xs text-[var(--text-muted)]">
              Started at {formatTime(activeEntry.start_time)}
            </p>
          ) : null}
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-col items-center gap-4">
        {/* Client */}
        {activeClients.length > 0 && (
          isRunning ? (
            activeEntry?.client_id ? (
              <p className="text-xs text-[var(--text-muted)]">
                Client:{" "}
                <span className="text-[var(--text-secondary)] font-medium">
                  {activeClients.find((c) => c.id === activeEntry.client_id)?.name ?? "—"}
                </span>
              </p>
            ) : null
          ) : (
            <div className="flex items-center gap-2">
              <label className="text-xs text-[var(--text-muted)]">Client</label>
              <Select
                value={selectedClientId ?? ""}
                onChange={(v) => setSelectedClientId(v || null)}
                options={[
                  { value: "", label: "No client" },
                  ...activeClients.map((c) => ({ value: c.id, label: c.name })),
                ]}
                className="bg-[var(--surface-2)] border border-[var(--border-strong)] rounded pl-2 pr-2 py-1 text-xs font-medium text-[var(--text-primary)] focus:border-[var(--brand)] focus:outline-none min-w-28"
              />
            </div>
          )
        )}

        {/* Buttons */}
        {!isRunning ? (
          <button
            onClick={() => start(selectedClientId)}
            className="flex items-center gap-2 px-7 py-2 rounded bg-[var(--brand)] hover:bg-[var(--brand-hover)] text-white font-medium text-sm transition-colors"
          >
            <Play size={14} fill="currentColor" />
            Start Timer
          </button>
        ) : (
          <button
            onClick={onRequestStop}
            className="flex items-center gap-2 px-5 py-2 rounded bg-[var(--surface-2)] border border-[var(--border-strong)] text-[var(--text-primary)] font-medium text-sm transition-colors hover:bg-[var(--surface-3)]"
          >
            <Square size={14} fill="currentColor" />
            Stop
          </button>
        )}

        {/* Kbd hints */}
        <p className="text-[11px] text-[var(--text-muted)] opacity-60">
          {toggleShortcut ? (
            <>
              <kbd className="font-mono">{formatShortcut(toggleShortcut, isMac)}</kbd> start / stop
            </>
          ) : (
            "No timer toggle shortcut set"
          )}
        </p>
      </div>

    </div>
  );
}
