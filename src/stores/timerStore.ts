import { create } from "zustand";
import { persist } from "zustand/middleware";
import { TimeEntry } from "../lib/commands";

interface TimerStore {
  activeEntry: TimeEntry | null;
  isRunning: boolean;
  isPaused: boolean;
  pauseOffset: number;
  pausedSince: number | null;
  setActiveEntry: (entry: TimeEntry | null) => void;
  setRunning: (running: boolean) => void;
  pause: () => void;
  resume: () => void;
  clear: () => void;
}

export const useTimerStore = create<TimerStore>()(
  persist(
    (set) => ({
      activeEntry: null,
      isRunning: false,
      isPaused: false,
      pauseOffset: 0,
      pausedSince: null,
      setActiveEntry: (entry) =>
        set({ activeEntry: entry, isRunning: entry !== null, isPaused: false, pauseOffset: 0, pausedSince: null }),
      setRunning: (running) => set({ isRunning: running }),
      pause: () => set({ isPaused: true, pausedSince: Date.now() }),
      resume: () =>
        set((s) => ({
          isPaused: false,
          pauseOffset: s.pauseOffset + (Date.now() - s.pausedSince!),
          pausedSince: null,
        })),
      clear: () => set({ activeEntry: null, isRunning: false, isPaused: false, pauseOffset: 0, pausedSince: null }),
    }),
    {
      name: "tock-timer",
    }
  )
);
