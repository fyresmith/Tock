import { useCallback } from "react";
import { useTimerStore } from "../stores/timerStore";
import { startTimer, stopTimer, discardTimer, getActiveTimer } from "../lib/commands";

export function useTimer() {
  const { activeEntry, isRunning, setActiveEntry, clear } = useTimerStore();

  const start = useCallback(async (clientId?: string | null) => {
    const entry = await startTimer(clientId ?? null);
    setActiveEntry(entry);
    return entry;
  }, [setActiveEntry]);

  const stopEntry = useCallback(
    async (
      entryId: string,
      options?: { description?: string | null; tagId?: string | null },
    ) => {
      const entry = await stopTimer(
        entryId,
        options?.description ?? null,
        options?.tagId ?? null,
      );
      clear();
      return entry;
    },
    [clear],
  );

  const stop = useCallback(
    async (description?: string | null, tagId?: string | null) => {
      if (!activeEntry) return null;
      return stopEntry(activeEntry.id, { description, tagId });
    },
    [activeEntry, stopEntry],
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
    } else {
      clear();
    }
    return entry;
  }, [clear, setActiveEntry]);

  return { activeEntry, isRunning, start, stop, stopEntry, discard, recover };
}
