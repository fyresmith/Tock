import { useState, useCallback } from "react";
import {
  listEntries,
  createEntry,
  updateEntry,
  deleteEntry,
  ListEntriesArgs,
  CreateEntryArgs,
  UpdateEntryArgs,
  TimeEntry,
} from "../lib/commands";

export function useEntries() {
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (filters: ListEntriesArgs = {}) => {
    try {
      setLoading(true);
      setError(null);
      const data = await listEntries(filters);
      setEntries(data);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  const add = useCallback(async (args: CreateEntryArgs) => {
    const entry = await createEntry(args);
    setEntries((prev) => [entry, ...prev]);
    return entry;
  }, []);

  const update = useCallback(async (args: UpdateEntryArgs) => {
    const entry = await updateEntry(args);
    setEntries((prev) => prev.map((e) => (e.id === entry.id ? entry : e)));
    return entry;
  }, []);

  const remove = useCallback(async (id: string) => {
    await deleteEntry(id);
    setEntries((prev) => prev.filter((e) => e.id !== id));
  }, []);

  return { entries, loading, error, load, add, update, remove };
}
