import { useCallback } from "react";
import { useTimerStore } from "../stores/timerStore";
import { startTimer, stopTimer, discardTimer, getActiveTimer } from "../lib/commands";

export function useTimer() {
  const { activeEntry, isRunning, isPaused, pauseOffset, pausedSince, setActiveEntry, clear, pause, resume } = useTimerStore();

  const start = useCallback(async (clientId?: string | null) => {
    const entry = await startTimer(clientId ?? null);
    setActiveEntry(entry);
    return entry;
  }, [setActiveEntry]);

  const stop = useCallback(
    async (description: string, tagId: string) => {
      if (!activeEntry) return null;
      const entry = await stopTimer(activeEntry.id, description, tagId);
      clear();
      return entry;
    },
    [activeEntry, clear]
  );

  const discard = useCallback(async () => {
    if (!activeEntry) return;
    await discardTimer(activeEntry.id);
    clear();
  }, [activeEntry, clear]);

  const recover = useCallback(async () => {
    const entry = await getActiveTimer();
    if (entry) {
      setActiveEntry(entry);
    }
    return entry;
  }, [setActiveEntry]);

  return { activeEntry, isRunning, isPaused, pauseOffset, pausedSince, start, stop, discard, recover, pause, resume };
}
