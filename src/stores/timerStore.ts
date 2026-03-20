import { create } from "zustand";
import { persist } from "zustand/middleware";
import { TimeEntry } from "../lib/commands";

interface TimerStore {
  activeEntry: TimeEntry | null;
  isRunning: boolean;
  setActiveEntry: (entry: TimeEntry | null) => void;
  clear: () => void;
}

type PersistedTimerStore = {
  activeEntry?: TimeEntry | null;
};

export const useTimerStore = create<TimerStore>()(
  persist(
    (set) => ({
      activeEntry: null,
      isRunning: false,
      setActiveEntry: (entry) =>
        set({ activeEntry: entry, isRunning: entry !== null }),
      clear: () => set({ activeEntry: null, isRunning: false }),
    }),
    {
      name: "tock-timer",
      version: 2,
      partialize: (state) => ({ activeEntry: state.activeEntry }),
      migrate: (persistedState) => {
        const state = (persistedState ?? {}) as PersistedTimerStore;
        return {
          activeEntry: state.activeEntry ?? null,
        };
      },
      merge: (persistedState, currentState) => {
        const state = (persistedState ?? {}) as PersistedTimerStore;
        const activeEntry = state.activeEntry ?? null;
        return {
          ...currentState,
          activeEntry,
          isRunning: activeEntry !== null,
        };
      },
    }
  )
);
