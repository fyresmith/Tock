import { create } from "zustand";
import { persist } from "zustand/middleware";
import { TimeEntry } from "../lib/commands";

interface TimerStore {
  activeEntry: TimeEntry | null;
  isRunning: boolean;
  setActiveEntry: (entry: TimeEntry | null) => void;
  setRunning: (running: boolean) => void;
  clear: () => void;
}

export const useTimerStore = create<TimerStore>()(
  persist(
    (set) => ({
      activeEntry: null,
      isRunning: false,
      setActiveEntry: (entry) =>
        set({ activeEntry: entry, isRunning: entry !== null }),
      setRunning: (running) => set({ isRunning: running }),
      clear: () => set({ activeEntry: null, isRunning: false }),
    }),
    {
      name: "tock-timer",
    }
  )
);
