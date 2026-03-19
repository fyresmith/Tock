import { useState, useEffect, useCallback } from "react";
import { getSettings, updateSetting, updateSettingsBatch, Settings, SettingChange } from "../lib/commands";

export function useSettings() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const s = await getSettings();
      setSettings(s);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const update = useCallback(async (key: string, value: string) => {
    const s = await updateSetting(key, value);
    setSettings(s);
    return s;
  }, []);

  const updateMany = useCallback(async (changes: SettingChange[]) => {
    const s = await updateSettingsBatch(changes);
    setSettings(s);
    return s;
  }, []);

  return { settings, loading, error, update, updateMany, reload: load };
}
