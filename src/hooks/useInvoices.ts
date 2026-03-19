import { useState, useCallback } from "react";
import {
  listInvoices,
  previewInvoice,
  createInvoice,
  issueInvoice,
  revertInvoiceToDraft,
  cancelInvoice,
  sendInvoice,
  markInvoicePaid,
  getInvoiceEntries,
  saveInvoicePdf as saveInvoicePdfCmd,
  deleteInvoice as deleteInvoiceCmd,
  Invoice,
  InvoiceFormat,
  InvoicePreview,
  InvoiceWithEntries,
  TimeEntry,
} from "../lib/commands";

export function useInvoices() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await listInvoices();
      setInvoices(data);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  const preview = useCallback(
    async (
      periodStart: string,
      periodEnd: string,
      format: InvoiceFormat = "detailed",
      layoutData: string | null = null,
      name: string | null = null,
      clientId: string | null = null
    ): Promise<InvoicePreview> => {
      return previewInvoice(periodStart, periodEnd, format, layoutData, name, clientId);
    },
    []
  );

  const create = useCallback(
    async (
      periodStart: string,
      periodEnd: string,
      entryIds: string[],
      format: InvoiceFormat = "detailed",
      layoutData: string | null = null,
      name: string | null = null,
      clientId: string | null = null
    ): Promise<InvoiceWithEntries> => {
      const result = await createInvoice(
        periodStart, periodEnd, entryIds, format, layoutData, name, clientId
      );
      setInvoices((prev) => [result.invoice, ...prev]);
      return result;
    },
    []
  );

  const issue = useCallback(async (invoiceId: string, issuedAt: string, dueAt: string) => {
    const updated = await issueInvoice(invoiceId, issuedAt, dueAt);
    setInvoices((prev) =>
      prev.map((inv) => (inv.id === updated.id ? updated : inv))
    );
    return updated;
  }, []);

  const revertToDraft = useCallback(async (invoiceId: string) => {
    const updated = await revertInvoiceToDraft(invoiceId);
    setInvoices((prev) =>
      prev.map((inv) => (inv.id === updated.id ? updated : inv))
    );
    return updated;
  }, []);

  const cancel = useCallback(async (invoiceId: string) => {
    const updated = await cancelInvoice(invoiceId);
    setInvoices((prev) =>
      prev.map((inv) => (inv.id === updated.id ? updated : inv))
    );
    return updated;
  }, []);

  const send = useCallback(async (invoiceId: string, sentAt: string) => {
    const updated = await sendInvoice(invoiceId, sentAt);
    setInvoices((prev) =>
      prev.map((inv) => (inv.id === updated.id ? updated : inv))
    );
    return updated;
  }, []);

  const markPaid = useCallback(async (invoiceId: string, paidAt: string) => {
    const updated = await markInvoicePaid(invoiceId, paidAt);
    setInvoices((prev) =>
      prev.map((inv) => (inv.id === updated.id ? updated : inv))
    );
    return updated;
  }, []);

  const fetchEntries = useCallback(
    async (invoiceId: string): Promise<TimeEntry[]> => {
      return getInvoiceEntries(invoiceId);
    },
    []
  );

  const savePdf = useCallback(async (invoiceId: string, path: string, bytes: number[]) => {
    const updated = await saveInvoicePdfCmd(invoiceId, path, bytes);
    setInvoices((prev) =>
      prev.map((inv) => (inv.id === updated.id ? updated : inv))
    );
    return updated;
  }, []);

  const deleteInvoice = useCallback(async (invoiceId: string) => {
    await deleteInvoiceCmd(invoiceId);
    setInvoices((prev) => prev.filter((inv) => inv.id !== invoiceId));
  }, []);

  return {
    invoices,
    loading,
    error,
    load,
    preview,
    create,
    issue,
    revertToDraft,
    cancel,
    send,
    markPaid,
    fetchEntries,
    savePdf,
    deleteInvoice,
  };
}
