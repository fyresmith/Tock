import { useState, useEffect, useCallback } from "react";
import {
  Client,
  listClients,
  createClient as createClientCmd,
  updateClient as updateClientCmd,
  setDefaultClient as setDefaultClientCmd,
  archiveClient as archiveClientCmd,
  unarchiveClient as unarchiveClientCmd,
} from "../lib/commands";

export function useClients() {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const data = await listClients();
      setClients(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const defaultClient = clients.find((c) => c.is_default && !c.is_archived) ?? null;
  const activeClients = clients.filter((c) => !c.is_archived);

  const add = useCallback(async (name: string, hourlyRate: number) => {
    const client = await createClientCmd(name, hourlyRate);
    setClients((prev) => [...prev, client].sort((a, b) => a.name.localeCompare(b.name)));
    return client;
  }, []);

  const update = useCallback(async (id: string, name: string, hourlyRate: number) => {
    const client = await updateClientCmd(id, name, hourlyRate);
    setClients((prev) => prev.map((c) => (c.id === id ? client : c)));
    return client;
  }, []);

  const setDefault = useCallback(async (id: string) => {
    const client = await setDefaultClientCmd(id);
    setClients((prev) =>
      prev.map((c) => ({ ...c, is_default: c.id === id ? true : false })).map((c) =>
        c.id === id ? client : c
      )
    );
    return client;
  }, []);

  const archive = useCallback(async (id: string) => {
    const client = await archiveClientCmd(id);
    setClients((prev) => prev.map((c) => (c.id === id ? client : c)));
    return client;
  }, []);

  const unarchive = useCallback(async (id: string) => {
    const client = await unarchiveClientCmd(id);
    setClients((prev) => prev.map((c) => (c.id === id ? client : c)));
    return client;
  }, []);

  return { clients, activeClients, defaultClient, loading, add, update, setDefault, archive, unarchive };
}
