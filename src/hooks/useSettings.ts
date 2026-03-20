import { useState, useEffect, useCallback } from "react";
import {
  getSettings,
  updateSetting,
  updateSettingsBatch,
  updateShortcutBindings,
  Settings,
  SettingChange,
} from "../lib/commands";

const SETTINGS_UPDATED_EVENT = "tock:settings-updated";

function emitSettingsUpdated(settings: Settings) {
  window.dispatchEvent(new CustomEvent<Settings>(SETTINGS_UPDATED_EVENT, { detail: settings }));
}

export function useSettings() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const s = await getSettings();
      setSettings(s);
      setError(null);
      emitSettingsUpdated(s);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const handleSettingsUpdated = (event: Event) => {
      const detail = (event as CustomEvent<Settings>).detail;
      setSettings(detail);
      setError(null);
      setLoading(false);
    };

    window.addEventListener(SETTINGS_UPDATED_EVENT, handleSettingsUpdated);
    return () => window.removeEventListener(SETTINGS_UPDATED_EVENT, handleSettingsUpdated);
  }, []);

  const update = useCallback(async (key: string, value: string) => {
    const s = await updateSetting(key, value);
    setSettings(s);
    setError(null);
    emitSettingsUpdated(s);
    return s;
  }, []);

  const updateMany = useCallback(async (changes: SettingChange[]) => {
    const s = await updateSettingsBatch(changes);
    setSettings(s);
    setError(null);
    emitSettingsUpdated(s);
    return s;
  }, []);

  const updateShortcuts = useCallback(async (bindings: Record<string, string>) => {
    const s = await updateShortcutBindings(bindings);
    setSettings(s);
    setError(null);
    emitSettingsUpdated(s);
    return s;
  }, []);

  return { settings, loading, error, update, updateMany, updateShortcuts, reload: load };
}
