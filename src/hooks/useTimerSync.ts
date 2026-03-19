import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { getActiveTimer } from "../lib/commands";
import { useTimerStore } from "../stores/timerStore";

/**
 * Listens for `timer-changed` events emitted by the Rust backend and
 * re-syncs the local timer store with the DB. This keeps the main window
 * and the popup window in sync regardless of which one initiated the change.
 */
export function useTimerSync() {
  const { setActiveEntry } = useTimerStore();

  useEffect(() => {
    let mounted = true;
    const unlistenPromise = listen("timer-changed", async () => {
      if (!mounted) return;
      const entry = await getActiveTimer();
      if (mounted) setActiveEntry(entry);
    });
    return () => {
      mounted = false;
      unlistenPromise.then((unlisten) => unlisten());
    };
  }, [setActiveEntry]);
}
