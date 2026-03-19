import { useEffect, useMemo, useState } from "react";
import { useTimer } from "../../hooks/useTimer";
import { useClients } from "../../hooks/useClients";
import { elapsedSeconds, secondsToHHMMSS, formatTime } from "../../lib/dateUtils";
import { StopPrompt } from "./StopPrompt";
import { openTimerPopup } from "../../lib/commands";
import { Play, Square, Pause, AlertTriangle, PictureInPicture2 } from "lucide-react";

export function TimerView() {
  const { activeEntry, isRunning, isPaused, pauseOffset, pausedSince, start, recover, pause, resume } = useTimer();
  const { activeClients, defaultClient } = useClients();
  const [elapsed, setElapsed] = useState(0);
  const [showStop, setShowStop] = useState(false);
  const [recovering, setRecovering] = useState(false);
  const [crashRecovery, setCrashRecovery] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);

  const isMac = useMemo(() => navigator.platform.toUpperCase().includes("MAC"), []);

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
      const recovered = await recover();
      if (recovered) setCrashRecovery(true);
      setRecovering(false);
    })();
  }, []);

  // Live timer
  useEffect(() => {
    if (!activeEntry || (!isRunning && !isPaused)) {
      setElapsed(0);
      return;
    }
    if (isPaused) {
      setElapsed(elapsedSeconds(activeEntry.start_time, activeEntry.date, pauseOffset, pausedSince ?? undefined));
      return;
    }
    const tick = () => setElapsed(elapsedSeconds(activeEntry.start_time, activeEntry.date, pauseOffset));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [isRunning, isPaused, activeEntry, pauseOffset, pausedSince]);

  if (recovering) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-[var(--text-muted)]">Checking for active session…</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-10 p-8 relative overflow-hidden">
      <button
        onClick={() => openTimerPopup()}
        className="absolute top-4 right-4 p-1.5 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-2)] transition-colors"
        title="Pop out timer"
      >
        <PictureInPicture2 size={15} />
      </button>

      {crashRecovery && activeEntry && (
        <div className="w-full max-w-sm rounded border border-[var(--warning)] bg-[var(--surface-2)] px-4 py-3 animate-fade-in flex gap-3 items-start">
          <AlertTriangle size={14} className="text-[var(--warning)] mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-xs text-[var(--warning)] font-semibold mb-0.5">Session recovered</p>
            <p className="text-xs text-[var(--text-secondary)]">
              A timer was running when the app closed. It's been resumed.
            </p>
          </div>
        </div>
      )}

      {/* Clock */}
      <div className="text-center flex flex-col items-center gap-3">
        <div className="flex items-center justify-center gap-1.5 h-4">
          {isRunning && !isPaused ? (
            <>
              <span
                className="w-1.5 h-1.5 rounded-full bg-[var(--brand)]"
                style={{ animation: "pulse-dot 1.5s ease-in-out infinite" }}
              />
              <span className="text-[10px] font-semibold tracking-widest uppercase text-[var(--brand)]">
                Recording
              </span>
            </>
          ) : isPaused ? (
            <>
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--text-muted)]" />
              <span className="text-[10px] font-semibold tracking-widest uppercase text-[var(--text-muted)]">
                Paused
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
          isRunning || isPaused ? (
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
              <select
                value={selectedClientId ?? ""}
                onChange={(e) => setSelectedClientId(e.target.value || null)}
                className="bg-[var(--surface-2)] border border-[var(--border)] rounded px-2 py-1 text-xs text-[var(--text-primary)] focus:border-[var(--brand)] focus:outline-none"
              >
                <option value="">No client</option>
                {activeClients.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          )
        )}

        {/* Buttons */}
        {!isRunning && !isPaused ? (
          <button
            onClick={() => start(selectedClientId)}
            className="flex items-center gap-2 px-7 py-2 rounded bg-[var(--brand)] hover:bg-[var(--brand-hover)] text-white font-medium text-sm transition-colors"
          >
            <Play size={14} fill="currentColor" />
            Start Timer
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <button
              onClick={() => isPaused ? resume() : pause()}
              className="flex items-center gap-2 px-5 py-2 rounded bg-[var(--surface-2)] border border-[var(--border-strong)] text-[var(--text-primary)] font-medium text-sm transition-colors hover:bg-[var(--surface-3)]"
            >
              {isPaused ? (
                <><Play size={14} fill="currentColor" /> Resume</>
              ) : (
                <><Pause size={14} fill="currentColor" /> Pause</>
              )}
            </button>
            <button
              onClick={() => setShowStop(true)}
              className="flex items-center gap-2 px-5 py-2 rounded bg-[var(--surface-2)] border border-[var(--border-strong)] text-[var(--text-primary)] font-medium text-sm transition-colors hover:bg-[var(--surface-3)]"
            >
              <Square size={14} fill="currentColor" />
              Stop
            </button>
          </div>
        )}

        {/* Kbd hints */}
        <p className="text-[11px] text-[var(--text-muted)] opacity-60">
          <kbd className="font-mono">Space</kbd> start/pause
          {" · "}
          <kbd className="font-mono">{isMac ? "⌘" : "Ctrl"}+↵</kbd> stop
        </p>
      </div>

      {showStop && <StopPrompt onClose={() => setShowStop(false)} />}
    </div>
  );
}
