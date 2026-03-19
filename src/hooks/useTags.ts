import { useCallback, useEffect, useState } from "react";
import {
  archiveTag,
  createTag,
  EntryTag,
  listTags,
  unarchiveTag,
  updateTag,
} from "../lib/commands";

export function useTags() {
  const [tags, setTags] = useState<EntryTag[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      setTags(await listTags());
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const add = useCallback(async (name: string, color: string) => {
    const tag = await createTag(name, color);
    setTags((prev) => [...prev, tag].sort((a, b) => a.sort_order - b.sort_order));
    return tag;
  }, []);

  const update = useCallback(async (id: string, name: string, color: string) => {
    const tag = await updateTag(id, name, color);
    setTags((prev) => prev.map((item) => (item.id === tag.id ? tag : item)));
    return tag;
  }, []);

  const archive = useCallback(async (id: string) => {
    const tag = await archiveTag(id);
    setTags((prev) => prev.map((item) => (item.id === tag.id ? tag : item)));
    return tag;
  }, []);

  const unarchive = useCallback(async (id: string) => {
    const tag = await unarchiveTag(id);
    setTags((prev) => prev.map((item) => (item.id === tag.id ? tag : item)));
    return tag;
  }, []);

  return { tags, loading, error, reload: load, add, update, archive, unarchive };
}
