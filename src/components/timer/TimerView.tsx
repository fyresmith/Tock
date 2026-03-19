import { useEffect, useState } from "react";
import { useTimer } from "../../hooks/useTimer";
import { elapsedSeconds, secondsToHHMMSS, formatTime } from "../../lib/dateUtils";
import { StopPrompt } from "./StopPrompt";
import { Play, Square, AlertTriangle } from "lucide-react";

export function TimerView() {
  const { activeEntry, isRunning, start, recover } = useTimer();
  const [elapsed, setElapsed] = useState(0);
  const [showStop, setShowStop] = useState(false);
  const [recovering, setRecovering] = useState(false);
  const [crashRecovery, setCrashRecovery] = useState(false);

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
    if (!isRunning || !activeEntry) {
      setElapsed(0);
      return;
    }
    const tick = () =>
      setElapsed(elapsedSeconds(activeEntry.start_time, activeEntry.date));
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
    <div className="flex-1 flex flex-col items-center justify-center gap-7 p-8 relative overflow-hidden">
      {crashRecovery && activeEntry && (
        <div className="w-full max-w-sm rounded border border-[var(--warning)] bg-[var(--surface-2)] px-4 py-3 animate-fade-in flex gap-3 items-start">
          <AlertTriangle size={14} className="text-[var(--warning)] mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-xs text-[var(--warning)] font-semibold mb-0.5">
              Session recovered
            </p>
            <p className="text-xs text-[var(--text-secondary)]">
              A timer was running when the app closed. It's been resumed.
            </p>
          </div>
        </div>
      )}

      {/* Clock display */}
      <div className="text-center">
        {/* Status badge */}
        <div className="flex items-center justify-center gap-1.5 mb-5">
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
          style={{
            fontSize: "5.5rem",
            letterSpacing: "-0.04em",
            lineHeight: 1,
          }}
        >
          {secondsToHHMMSS(elapsed)}
        </div>

        {activeEntry && (
          <p className="text-xs text-[var(--text-muted)] mt-3">
            Started at {formatTime(activeEntry.start_time)}
          </p>
        )}
      </div>

      {/* Buttons */}
      <div className="flex flex-col items-center gap-2.5">
        {!isRunning ? (
          <button
            onClick={start}
            className="flex items-center gap-2 px-6 py-2 rounded bg-[var(--brand)] hover:bg-[var(--brand-hover)] text-white font-medium text-sm transition-colors"
          >
            <Play size={14} fill="currentColor" />
            Start Timer
          </button>
        ) : (
          <button
            onClick={() => setShowStop(true)}
            className="flex items-center gap-2 px-6 py-2 rounded bg-[var(--surface-2)] border border-[var(--border-strong)] text-[var(--text-primary)] font-medium text-sm transition-colors hover:bg-[var(--surface-3)]"
          >
            <Square size={14} fill="currentColor" />
            Stop Timer
          </button>
        )}

        <p className="text-xs text-[var(--text-muted)]">
          Press{" "}
          <kbd className="px-1.5 py-0.5 rounded-sm bg-[var(--surface-2)] border border-[var(--border-strong)] font-mono text-[10px]">
            Space
          </kbd>{" "}
          to toggle
        </p>
      </div>

      {showStop && (
        <StopPrompt onClose={() => setShowStop(false)} />
      )}
    </div>
  );
}
