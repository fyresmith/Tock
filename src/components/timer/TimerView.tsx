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
    <div className="flex-1 flex flex-col items-center justify-center gap-8 p-8 relative overflow-hidden">
      {/* Ambient glow behind the clock when running */}
      {isRunning && (
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background: "radial-gradient(ellipse 60% 40% at 50% 50%, var(--timer-glow-lg), transparent 70%)",
          }}
        />
      )}

      {crashRecovery && activeEntry && (
        <div className="w-full max-w-sm rounded-xl border border-[var(--warning)] bg-[var(--surface-2)] px-5 py-4 animate-fade-in flex gap-3 items-start z-10">
          <AlertTriangle size={16} className="text-[var(--warning)] mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm text-[var(--warning)] font-medium mb-0.5">
              Session recovered
            </p>
            <p className="text-xs text-[var(--text-secondary)]">
              A timer was running when the app closed. It's been resumed.
            </p>
          </div>
        </div>
      )}

      {/* Clock display */}
      <div className="text-center relative z-10">
        {/* Glow ring behind clock */}
        {isRunning && (
          <div
            className="absolute inset-0 -m-8 rounded-full blur-3xl animate-glow-pulse pointer-events-none"
            style={{ background: "var(--timer-glow)" }}
          />
        )}

        {/* Status badge */}
        <div className="flex items-center justify-center gap-1.5 mb-4">
          {isRunning ? (
            <>
              <span
                className="w-1.5 h-1.5 rounded-full bg-[var(--brand)]"
                style={{ animation: "pulse-dot 1.5s ease-in-out infinite" }}
              />
              <span className="text-[11px] font-semibold tracking-widest uppercase text-[var(--brand)]">
                Recording
              </span>
            </>
          ) : (
            <span className="text-xs text-[var(--text-muted)] tracking-widest uppercase">
              Ready
            </span>
          )}
        </div>

        <div
          className="font-mono font-bold tabular-nums text-[var(--text-primary)] relative"
          style={{
            fontSize: "5.5rem",
            letterSpacing: "-0.04em",
            lineHeight: 1,
            animation: isRunning ? "timer-tick 1s ease-in-out infinite alternate" : undefined,
          }}
        >
          {secondsToHHMMSS(elapsed)}
        </div>

        {activeEntry && (
          <p className="text-sm text-[var(--text-secondary)] mt-3">
            Started at {formatTime(activeEntry.start_time)}
          </p>
        )}
      </div>

      {/* Buttons */}
      <div className="flex flex-col items-center gap-3 z-10">
        {!isRunning ? (
          <button
            onClick={start}
            className="flex items-center gap-2.5 px-10 py-4 rounded-2xl text-white font-semibold text-base transition-opacity hover:opacity-90 shadow-lg"
            style={{
              background: "linear-gradient(135deg, var(--brand), var(--brand-hover))",
            }}
          >
            <Play size={18} fill="currentColor" />
            Start Timer
          </button>
        ) : (
          <button
            onClick={() => setShowStop(true)}
            className="flex items-center gap-2.5 px-10 py-4 rounded-2xl bg-[var(--surface-2)] border border-[var(--border-strong)] text-[var(--text-primary)] font-semibold text-base transition-colors hover:bg-[var(--surface-3)] shadow-lg"
          >
            <Square size={18} fill="currentColor" />
            Stop Timer
          </button>
        )}

        <p className="text-xs text-[var(--text-muted)]">
          Press{" "}
          <kbd className="px-1.5 py-0.5 rounded bg-[var(--surface-2)] border border-[var(--border-strong)] font-mono text-[11px]">
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
