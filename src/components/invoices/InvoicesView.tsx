import { useEffect, useMemo, useState } from "react";
import { addDays, format } from "date-fns";
import { useInvoices } from "../../hooks/useInvoices";
import { useSettings } from "../../hooks/useSettings";
import { Invoice, InvoiceWithEntries, TimeEntry } from "../../lib/commands";
import { downloadInvoicePDF } from "./InvoicePDF";
import { GenerateFlow } from "./GenerateFlow";
import { TagBadge } from "../tags/TagBadge";
import { formatCurrency, formatDate } from "../../lib/dateUtils";
import {
  ArrowLeftCircle,
  CheckCircle,
  Download,
  ExternalLink,
  FilePlus,
  FileText,
  Mail,
  Trash2,
  X,
} from "lucide-react";

function todayDate() {
  return format(new Date(), "yyyy-MM-dd");
}

function nowIsoLocal() {
  return format(new Date(), "yyyy-MM-dd'T'HH:mm:ss");
}

function statusLabel(invoice: Invoice) {
  if (invoice.is_overdue) return "overdue";
  return invoice.status;
}

function statusTone(invoice: Invoice) {
  if (invoice.status === "paid") return "bg-[var(--success)]/15 text-[var(--success)]";
  if (invoice.is_overdue) return "bg-[var(--danger)]/15 text-[var(--danger)]";
  if (invoice.status === "sent") return "bg-[var(--brand)]/15 text-[var(--brand)]";
  if (invoice.status === "issued") return "bg-[var(--warning)]/15 text-[var(--warning)]";
  return "bg-[var(--surface-2)] text-[var(--text-secondary)]";
}

function InvoiceDetailModal({
  invoice,
  entries,
  entriesLoading,
  currency,
  onClose,
  onDownload,
  onIssue,
  onRevert,
  onSend,
  onMarkPaid,
  onDelete,
  working,
}: {
  invoice: Invoice;
  entries: TimeEntry[];
  entriesLoading: boolean;
  currency: string;
  onClose: () => void;
  onDownload: () => Promise<void>;
  onIssue: (dueAt: string) => Promise<void>;
  onRevert: () => Promise<void>;
  onSend: () => Promise<void>;
  onMarkPaid: (paidAt: string) => Promise<void>;
  onDelete: () => Promise<void>;
  working: string | null;
}) {
  const [dueAt, setDueAt] = useState(invoice.due_at ?? format(addDays(new Date(), 30), "yyyy-MM-dd"));
  const [paidAt, setPaidAt] = useState(invoice.paid_at ?? todayDate());

  useEffect(() => {
    setDueAt(invoice.due_at ?? format(addDays(new Date(), 30), "yyyy-MM-dd"));
    setPaidAt(invoice.paid_at ?? todayDate());
  }, [invoice.due_at, invoice.paid_at, invoice.id]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-5">
      <div className="w-full max-w-5xl max-h-[92vh] overflow-hidden rounded-[1.75rem] border border-[var(--border-strong)] bg-[var(--surface-1)] shadow-2xl animate-slide-up flex flex-col">
        <div className="border-b border-[var(--border)] px-6 py-5 flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-semibold text-[var(--text-primary)]">
                {invoice.name || invoice.invoice_number}
              </h2>
              <span className={`rounded-full px-2.5 py-1 text-xs font-medium capitalize ${statusTone(invoice)}`}>
                {statusLabel(invoice)}
              </span>
            </div>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              {formatDate(invoice.period_start)} – {formatDate(invoice.period_end)}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-xl p-2 text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--text-primary)]"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-auto p-6 grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
          <div className="space-y-4">
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-5">
              <p className="text-sm font-semibold text-[var(--text-primary)]">Lifecycle</p>
              <div className="mt-4 space-y-2 text-sm">
                <div className="flex justify-between text-[var(--text-secondary)]">
                  <span>Created</span>
                  <span>{formatDate(invoice.created_at.slice(0, 10))}</span>
                </div>
                {invoice.issued_at && (
                  <div className="flex justify-between text-[var(--text-secondary)]">
                    <span>Issued</span>
                    <span>{formatDate(invoice.issued_at.slice(0, 10))}</span>
                  </div>
                )}
                {invoice.sent_at && (
                  <div className="flex justify-between text-[var(--text-secondary)]">
                    <span>Sent</span>
                    <span>{formatDate(invoice.sent_at.slice(0, 10))}</span>
                  </div>
                )}
                {invoice.due_at && (
                  <div className="flex justify-between text-[var(--text-secondary)]">
                    <span>Due</span>
                    <span>{formatDate(invoice.due_at)}</span>
                  </div>
                )}
                {invoice.paid_at && (
                  <div className="flex justify-between text-[var(--text-secondary)]">
                    <span>Paid</span>
                    <span>{formatDate(invoice.paid_at.slice(0, 10))}</span>
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-5">
              <p className="text-sm font-semibold text-[var(--text-primary)]">Totals</p>
              <div className="mt-4 space-y-2 text-sm">
                <div className="flex justify-between text-[var(--text-secondary)]">
                  <span>Hours</span>
                  <span className="text-[var(--text-primary)] tabular-nums">{invoice.total_hours.toFixed(2)}h</span>
                </div>
                <div className="flex justify-between text-[var(--text-secondary)]">
                  <span>Rate</span>
                  <span className="text-[var(--text-primary)]">{formatCurrency(invoice.hourly_rate, currency)}/hr</span>
                </div>
                <div className="flex justify-between border-t border-[var(--border)] pt-3 font-semibold text-[var(--text-primary)]">
                  <span>Total</span>
                  <span>{formatCurrency(invoice.total_amount, currency)}</span>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-5 space-y-3">
              <button
                onClick={onDownload}
                disabled={working !== null}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-[var(--surface-1)] border border-[var(--border)] text-sm text-[var(--text-primary)] hover:bg-[var(--surface-3)] transition-colors disabled:opacity-50"
              >
                <Download size={15} />
                Download PDF
              </button>

              {invoice.status === "draft" && (
                <>
                  <div>
                    <label className="block mb-1 text-xs font-medium text-[var(--text-secondary)]">
                      Due date
                    </label>
                    <input
                      type="date"
                      value={dueAt}
                      onChange={(event) => setDueAt(event.target.value)}
                      className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-1)] px-3 py-2 text-sm text-[var(--text-primary)] focus:border-[var(--brand)] focus:outline-none"
                    />
                  </div>
                  <button
                    onClick={() => onIssue(dueAt)}
                    disabled={working !== null}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-[var(--brand)] hover:bg-[var(--brand-hover)] text-white text-sm font-medium transition-colors disabled:opacity-50"
                  >
                    <ExternalLink size={15} />
                    Issue Invoice
                  </button>
                </>
              )}

              {invoice.status === "issued" && (
                <>
                  <button
                    onClick={onSend}
                    disabled={working !== null}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-[var(--brand)] hover:bg-[var(--brand-hover)] text-white text-sm font-medium transition-colors disabled:opacity-50"
                  >
                    <Mail size={15} />
                    Mark Sent
                  </button>
                  <button
                    onClick={onRevert}
                    disabled={working !== null}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-[var(--surface-1)] border border-[var(--border)] text-sm text-[var(--text-primary)] hover:bg-[var(--surface-3)] transition-colors disabled:opacity-50"
                  >
                    <ArrowLeftCircle size={15} />
                    Revert To Draft
                  </button>
                </>
              )}

              {invoice.status === "sent" && (
                <>
                  <div>
                    <label className="block mb-1 text-xs font-medium text-[var(--text-secondary)]">
                      Paid date
                    </label>
                    <input
                      type="date"
                      value={paidAt}
                      onChange={(event) => setPaidAt(event.target.value)}
                      className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-1)] px-3 py-2 text-sm text-[var(--text-primary)] focus:border-[var(--brand)] focus:outline-none"
                    />
                  </div>
                  <button
                    onClick={() => onMarkPaid(paidAt)}
                    disabled={working !== null}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-[var(--success)]/15 hover:bg-[var(--success)]/25 text-sm text-[var(--success)] font-medium transition-colors disabled:opacity-50"
                  >
                    <CheckCircle size={15} />
                    Mark Paid
                  </button>
                </>
              )}

              {!invoice.is_locked && (
                <button
                  onClick={onDelete}
                  disabled={working !== null}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-[var(--danger)]/15 hover:bg-[var(--danger)]/25 text-sm text-[var(--danger)] font-medium transition-colors disabled:opacity-50"
                >
                  <Trash2 size={15} />
                  Delete Invoice
                </button>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] overflow-hidden flex flex-col">
            <div className="border-b border-[var(--border)] px-5 py-4">
              <p className="text-sm font-semibold text-[var(--text-primary)]">Entries</p>
              <p className="text-xs text-[var(--text-muted)] mt-1">
                {invoice.is_locked
                  ? "Locked invoices show frozen snapshot rows."
                  : "Draft and issued invoices show live linked entries."}
              </p>
            </div>
            <div className="flex-1 overflow-auto">
              {entriesLoading ? (
                <div className="flex items-center justify-center h-40 text-[var(--text-muted)]">
                  Loading entries…
                </div>
              ) : entries.length === 0 ? (
                <div className="flex items-center justify-center h-40 text-[var(--text-muted)]">
                  No entries
                </div>
              ) : (
                <table className="w-full">
                  <thead className="sticky top-0 bg-[var(--surface-2)] border-b border-[var(--border)]">
                    <tr>
                      {["Date", "Description", "Tag", "Hours"].map((label) => (
                        <th
                          key={label}
                          className="px-4 py-3 text-left text-[11px] uppercase tracking-[0.18em] text-[var(--text-muted)]"
                        >
                          {label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border)]">
                    {entries.map((entry) => (
                      <tr key={entry.id}>
                        <td className="px-4 py-3 text-xs text-[var(--text-secondary)]">
                          {formatDate(entry.date)}
                        </td>
                        <td className="px-4 py-3 text-sm text-[var(--text-primary)]">
                          {entry.description || "—"}
                        </td>
                        <td className="px-4 py-3 text-xs text-[var(--text-secondary)]">
                          <TagBadge tag={entry} />
                        </td>
                        <td className="px-4 py-3 text-sm font-mono text-[var(--text-primary)]">
                          {((entry.duration_minutes ?? 0) / 60).toFixed(2)}h
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function InvoicesView() {
  const {
    invoices,
    loading,
    error,
    load,
    issue,
    revertToDraft,
    send,
    markPaid,
    fetchEntries,
    deleteInvoice,
  } = useInvoices();
  const { settings } = useSettings();
  const [showGenerate, setShowGenerate] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [detailEntries, setDetailEntries] = useState<TimeEntry[]>([]);
  const [entriesLoading, setEntriesLoading] = useState(false);
  const [working, setWorking] = useState<string | null>(null);

  useEffect(() => {
    load();
  }, [load]);

  const currency = settings?.currency ?? "USD";

  const openInvoice = async (invoice: Invoice) => {
    setSelectedInvoice(invoice);
    setEntriesLoading(true);
    try {
      setDetailEntries(await fetchEntries(invoice.id));
    } finally {
      setEntriesLoading(false);
    }
  };

  const selectedInvoiceFresh = useMemo(
    () => invoices.find((invoice) => invoice.id === selectedInvoice?.id) ?? selectedInvoice,
    [invoices, selectedInvoice]
  );

  const refreshSelectedEntries = async (invoiceId: string) => {
    setEntriesLoading(true);
    try {
      setDetailEntries(await fetchEntries(invoiceId));
    } finally {
      setEntriesLoading(false);
    }
  };

  const withWorking = async (key: string, fn: () => Promise<void>) => {
    setWorking(key);
    try {
      await fn();
    } finally {
      setWorking(null);
    }
  };

  const handleDownload = async (invoice: Invoice) => {
    if (!settings) return;
    await withWorking(`download-${invoice.id}`, async () => {
      const entries = invoice.id === selectedInvoice?.id ? detailEntries : await fetchEntries(invoice.id);
      downloadInvoicePDF(invoice, entries, settings);
    });
  };

  const handleGenerated = async (_result: InvoiceWithEntries) => {
    await load();
  };

  const runLifecycleAction = async (invoiceId: string, action: () => Promise<void>) => {
    await withWorking(invoiceId, async () => {
      await action();
      await load();
      await refreshSelectedEntries(invoiceId);
    });
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="px-6 py-4 border-b border-[var(--border)] bg-[var(--surface-1)] flex items-center justify-between">
        <h1 className="text-base font-semibold text-[var(--text-primary)]">Invoices</h1>
        <button
          onClick={() => setShowGenerate(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--brand)] hover:bg-[var(--brand-hover)] text-white text-sm font-medium transition-colors"
        >
          <FilePlus size={15} />
          Generate Invoice
        </button>
      </div>

      <div className="flex-1 overflow-auto p-6">
        {loading ? (
          <div className="flex items-center justify-center h-32 text-[var(--text-muted)]">Loading…</div>
        ) : error ? (
          <div className="text-[var(--danger)] text-sm">{error}</div>
        ) : invoices.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 gap-2 text-[var(--text-muted)]">
            <FileText size={36} strokeWidth={1.5} />
            <p className="text-sm">No invoices yet</p>
            <p className="text-xs">Generate your first invoice from your time entries</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 max-w-5xl">
            {invoices.map((invoice) => (
              <div
                key={invoice.id}
                className="bg-[var(--surface-1)] border border-[var(--border)] rounded-xl p-4 flex flex-col gap-3"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-base font-bold text-[var(--text-primary)] leading-tight">
                      {invoice.name || invoice.invoice_number}
                    </p>
                    <p className="text-xs text-[var(--text-muted)] mt-0.5">
                      {invoice.invoice_number}
                    </p>
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-medium capitalize ${statusTone(invoice)}`}>
                    {statusLabel(invoice)}
                  </span>
                </div>

                <p className="text-sm text-[var(--text-secondary)]">
                  {formatDate(invoice.period_start)} – {formatDate(invoice.period_end)}
                </p>

                <div className="grid grid-cols-2 gap-2 text-xs text-[var(--text-muted)]">
                  <div>{invoice.total_hours.toFixed(2)}h</div>
                  <div className="text-right text-[var(--text-secondary)] font-medium">
                    {formatCurrency(invoice.total_amount, currency)}
                  </div>
                  <div>
                    {invoice.due_at ? `Due ${formatDate(invoice.due_at)}` : "Not issued"}
                  </div>
                  <div className="text-right">
                    {invoice.paid_at ? `Paid ${formatDate(invoice.paid_at.slice(0, 10))}` : ""}
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-2 border-t border-[var(--border)]">
                  <button
                    onClick={() => openInvoice(invoice)}
                    className="flex-1 px-3 py-2 rounded-lg bg-[var(--surface-2)] hover:bg-[var(--surface-3)] text-sm text-[var(--text-primary)] border border-[var(--border)] transition-colors"
                  >
                    Open
                  </button>
                  <button
                    onClick={() => handleDownload(invoice)}
                    disabled={working === `download-${invoice.id}`}
                    className="px-3 py-2 rounded-lg bg-[var(--surface-2)] hover:bg-[var(--surface-3)] text-sm text-[var(--text-secondary)] border border-[var(--border)] transition-colors disabled:opacity-50"
                  >
                    <Download size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showGenerate && settings && (
        <GenerateFlow
          onClose={() => setShowGenerate(false)}
          onGenerated={handleGenerated}
          settings={settings}
        />
      )}

      {selectedInvoiceFresh && (
        <InvoiceDetailModal
          invoice={selectedInvoiceFresh}
          entries={detailEntries}
          entriesLoading={entriesLoading}
          currency={currency}
          onClose={() => setSelectedInvoice(null)}
          onDownload={() => handleDownload(selectedInvoiceFresh)}
          onIssue={(dueAt) =>
            runLifecycleAction(selectedInvoiceFresh.id, async () => {
              await issue(selectedInvoiceFresh.id, todayDate(), dueAt);
            })
          }
          onRevert={() =>
            runLifecycleAction(selectedInvoiceFresh.id, async () => {
              await revertToDraft(selectedInvoiceFresh.id);
            })
          }
          onSend={() =>
            runLifecycleAction(selectedInvoiceFresh.id, async () => {
              await send(selectedInvoiceFresh.id, nowIsoLocal());
            })
          }
          onMarkPaid={(paidAt) =>
            runLifecycleAction(selectedInvoiceFresh.id, async () => {
              await markPaid(selectedInvoiceFresh.id, paidAt);
            })
          }
          onDelete={async () => {
            await withWorking(selectedInvoiceFresh.id, async () => {
              await deleteInvoice(selectedInvoiceFresh.id);
              setSelectedInvoice(null);
              await load();
            });
          }}
          working={working}
        />
      )}
    </div>
  );
}
