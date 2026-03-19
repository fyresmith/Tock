import { useEffect } from "react";
import { PopupTimerView } from "./components/timer/PopupTimerView";
import { useSettings } from "./hooks/useSettings";
import { useTimerSync } from "./hooks/useTimerSync";

export function PopupApp() {
  const { settings } = useSettings();
  useTimerSync();

  useEffect(() => {
    if (settings?.theme === "light") {
      document.documentElement.classList.add("light");
    } else {
      document.documentElement.classList.remove("light");
    }
  }, [settings?.theme]);

  return (
    <div className="flex h-full bg-[var(--surface-1)] text-[var(--text-primary)]">
      <PopupTimerView />
    </div>
  );
}
