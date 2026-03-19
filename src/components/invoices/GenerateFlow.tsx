import { useMemo, useState } from "react";
import { useInvoices } from "../../hooks/useInvoices";
import {
  InvoiceFormat,
  InvoicePreview,
  InvoiceWithEntries,
  Settings,
} from "../../lib/commands";
import { formatDate, formatCurrency } from "../../lib/dateUtils";
import { DateRangePicker, workdayRange } from "./DateRangePicker";
import { getInvoicePdfBlob } from "./InvoicePDF";
import { InvoicePdfViewer } from "./InvoicePdfViewer";
import {
  X,
  ChevronRight,
  ChevronLeft,
  Layers,
  List,
  LayoutGrid,
  CalendarDays,
  FileText,
  Eye,
  Receipt,
} from "lucide-react";

interface GenerateFlowProps {
  onClose: () => void;
  onGenerated: (result: InvoiceWithEntries) => Promise<void> | void;
  settings: Settings;
}

type Step = "format" | "period" | "select" | "preview";

const ALL_STEPS: Step[] = ["format", "period", "select", "preview"];
const STEP_LABELS = ["Format", "Period", "Select", "Preview"];

const FORMAT_OPTIONS: {
  value: InvoiceFormat;
  label: string;
  description: string;
  icon: React.ElementType;
}[] = [
  { value: "detailed", label: "Detailed", description: "Every entry as its own row", icon: List },
  { value: "weekly", label: "Weekly", description: "Grid of weeks with per-week descriptions", icon: LayoutGrid },
  { value: "daily", label: "Daily Summary", description: "One row per day, consolidated hours", icon: CalendarDays },
  { value: "simple", label: "Simple", description: "Totals only, no line items", icon: FileText },
  { value: "type-breakdown", label: "By Tag", description: "Grouped by your dynamic entry tags", icon: Layers },
];

function isoWeekStr(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

function getCalendarWeeks(start: string, end: string): { isoWeek: string; label: string }[] {
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const result: { isoWeek: string; label: string }[] = [];
  const endDate = new Date(end + "T00:00:00");

  const cursor = new Date(start + "T00:00:00");
  const day = cursor.getDay();
  cursor.setDate(cursor.getDate() + (day === 0 ? -6 : 1 - day));

  while (cursor <= endDate) {
    const weekEnd = new Date(cursor);
    weekEnd.setDate(weekEnd.getDate() + 6);
    result.push({
      isoWeek: isoWeekStr(cursor),
      label: `Week of ${months[cursor.getMonth()]} ${cursor.getDate()} – ${months[weekEnd.getMonth()]} ${weekEnd.getDate()}`,
    });
    cursor.setDate(cursor.getDate() + 7);
  }

  return result;
}

const STEP_TITLES: Record<Step, string> = {
  format: "Choose Format",
  period: "Select Period",
  select: "Select Entries",
  preview: "Review PDF",
};

const STEP_DESCRIPTIONS: Record<Step, string> = {
  format: "Pick the invoice layout before building the candidate entry set.",
  period: "Choose the date window for eligible, uninvoiced entries.",
  select: "Adjust the included entries and confirm the totals before generating the final PDF preview.",
  preview: "Inspect the generated document. Confirm only after the PDF looks right.",
};

export function GenerateFlow({ onClose, onGenerated, settings }: GenerateFlowProps) {
  const { preview, create } = useInvoices();
  const [step, setStep] = useState<Step>("format");
  const [format, setFormat] = useState<InvoiceFormat>("detailed");
  const [invoiceName, setInvoiceName] = useState("");
  const [previewData, setPreviewData] = useState<InvoicePreview | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [weekDescriptions, setWeekDescriptions] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const today = new Date();
  const defaultRange = workdayRange(today.getFullYear(), today.getMonth());
  const [periodStart, setPeriodStart] = useState(defaultRange[0]);
  const [periodEnd, setPeriodEnd] = useState(defaultRange[1]);

  const stepIndex = ALL_STEPS.indexOf(step);
  const trimmedInvoiceName = invoiceName.trim() || null;
  const previewEntries = previewData?.entries ?? [];
  const calendarWeeks =
    format === "weekly" && periodStart && periodEnd
      ? getCalendarWeeks(periodStart, periodEnd)
      : [];

  const layoutData =
    format === "weekly"
      ? JSON.stringify({ week_descriptions: weekDescriptions })
      : null;

  const selectedEntries = useMemo(
    () => previewEntries.filter((entry) => selectedIds.has(entry.id)),
    [previewEntries, selectedIds]
  );
  const selectedCount = selectedEntries.length;
  const totalMinutes = selectedEntries.reduce(
    (sum, entry) => sum + (entry.duration_minutes ?? 0),
    0
  );
  const totalHours = totalMinutes / 60;
  const hourlyRate = previewData?.hourly_rate ?? 0;
  const totalAmount = Math.round(totalHours * hourlyRate * 100) / 100;
  const currency = settings.currency || "USD";
  const allSelected = previewEntries.length > 0 && selectedCount === previewEntries.length;

  const previewDocument = useMemo(() => {
    if (!previewData) return null;
    return {
      ...previewData,
      total_hours: totalHours,
      total_amount: totalAmount,
      layout_data: layoutData,
      name: trimmedInvoiceName,
    };
  }, [layoutData, previewData, totalAmount, totalHours, trimmedInvoiceName]);

  const previewBlob = useMemo(() => {
    if (step !== "preview" || !previewDocument || selectedEntries.length === 0) {
      return null;
    }

    return getInvoicePdfBlob(previewDocument, selectedEntries, settings);
  }, [previewDocument, selectedEntries, settings, step]);

  const loadSelectionStep = async () => {
    setLoading(true);
    setError("");
    try {
      const result = await preview(
        periodStart,
        periodEnd,
        format,
        layoutData,
        trimmedInvoiceName
      );
      setPreviewData(result);
      setSelectedIds(new Set(result.entries.map((entry) => entry.id)));
      setStep("select");
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  const handlePeriodNext = async () => {
    if (!periodStart || !periodEnd) {
      setError("Select both start and end dates");
      return;
    }
    if (periodStart > periodEnd) {
      setError("Start must be before end");
      return;
    }

    await loadSelectionStep();
  };

  const handleConfirm = async () => {
    if (!previewData) return;

    setLoading(true);
    setError("");
    try {
      const result = await create(
        previewData.period_start,
        previewData.period_end,
        selectedEntries.map((entry) => entry.id),
        format,
        layoutData,
        trimmedInvoiceName
      );
      await onGenerated(result);
      onClose();
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  const toggleSelected = (id: string) => {
    setSelectedIds((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAllSelected = () => {
    setSelectedIds(
      allSelected ? new Set() : new Set(previewEntries.map((entry) => entry.id))
    );
  };

  const modalShellClass =
    step === "preview"
      ? "max-w-[min(94vw,1380px)] h-[min(92vh,940px)]"
      : step === "select"
      ? "max-w-[min(92vw,1120px)] h-[min(88vh,860px)]"
      : "max-w-[min(92vw,820px)]";
  const bodyClass =
    step === "format" || step === "period"
      ? "min-h-0 flex-1 overflow-auto p-4 sm:p-6"
      : "min-h-0 flex-1 overflow-auto p-4 sm:p-6 xl:overflow-hidden";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-5">
      <div className={`w-full overflow-hidden rounded-[1.75rem] border border-[var(--border-strong)] bg-[var(--surface-1)] shadow-2xl animate-slide-up flex flex-col ${modalShellClass}`}>
        <div className="border-b border-[var(--border)] px-6 py-5">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <span className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface-2)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--text-secondary)]">
                  <Receipt size={12} />
                  Invoice Builder
                </span>
                <div className="flex items-center gap-2">
                  {ALL_STEPS.map((item, index) => (
                    <div key={item} className="flex items-center gap-2">
                      <div
                        className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold transition-colors ${
                          index <= stepIndex
                            ? "bg-[var(--brand)] text-white"
                            : "bg-[var(--surface-2)] text-[var(--text-muted)]"
                        }`}
                      >
                        {index + 1}
                      </div>
                      <span className={`hidden text-xs font-medium md:block ${
                        index === stepIndex
                          ? "text-[var(--text-primary)]"
                          : "text-[var(--text-muted)]"
                      }`}>
                        {STEP_LABELS[index]}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <h2 className="text-xl font-semibold text-[var(--text-primary)]">
                  {STEP_TITLES[step]}
                </h2>
                <p className="mt-1 text-sm text-[var(--text-secondary)]">
                  {STEP_DESCRIPTIONS[step]}
                </p>
              </div>
            </div>

            <button
              onClick={onClose}
              className="rounded-xl p-2 text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--text-primary)]"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <div className={bodyClass}>
          {step === "format" && (
            <div className="mx-auto max-w-3xl space-y-5">
              <div className="grid gap-3 md:grid-cols-2">
                {FORMAT_OPTIONS.map(({ value, label, description, icon: Icon }) => {
                  const selected = format === value;
                  return (
                    <button
                      key={value}
                      onClick={() => setFormat(value)}
                      className={`rounded-2xl border p-4 text-left transition-all ${
                        selected
                          ? "border-[var(--brand)] bg-[var(--brand-muted)] shadow-[0_0_0_1px_var(--brand-muted-border)]"
                          : "border-[var(--border)] bg-[var(--surface-2)] hover:border-[var(--border-strong)] hover:bg-[var(--surface-3)]"
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div className={`mt-0.5 rounded-xl p-2 ${
                          selected ? "bg-white/12 text-white" : "bg-[var(--surface-1)] text-[var(--text-muted)]"
                        }`}>
                          <Icon size={18} />
                        </div>
                        <div>
                          <div className={`text-sm font-semibold ${selected ? "text-[var(--text-primary)]" : "text-[var(--text-primary)]"}`}>
                            {label}
                          </div>
                          <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">
                            {description}
                          </p>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {step === "period" && (
            <div className="mx-auto max-w-2xl space-y-5">
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-5">
                <label className="mb-2 block text-xs font-medium uppercase tracking-[0.18em] text-[var(--text-muted)]">
                  Invoice Name
                </label>
                <input
                  type="text"
                  value={invoiceName}
                  onChange={(event) => setInvoiceName(event.target.value)}
                  placeholder="e.g. March Services"
                  className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-1)] px-3 py-2.5 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:border-[var(--brand)] focus:outline-none"
                />
                <p className="mt-2 text-xs text-[var(--text-muted)]">
                  Leave blank to use the generated invoice number.
                </p>
              </div>

              <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-5">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-[0.18em] text-[var(--text-muted)]">
                      Billing Period
                    </p>
                    <p className="mt-1 text-sm text-[var(--text-secondary)]">
                      {formatDate(periodStart)} – {formatDate(periodEnd)}
                    </p>
                  </div>
                </div>
                <DateRangePicker
                  startDate={periodStart}
                  endDate={periodEnd}
                  onChange={(start, end) => {
                    setPeriodStart(start);
                    setPeriodEnd(end);
                  }}
                />
              </div>

              {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
            </div>
          )}

          {step === "select" && previewData && (
            <div className="flex flex-col gap-4 xl:grid xl:h-full xl:min-h-0 xl:grid-cols-[minmax(0,1.25fr)_340px]">
              <div className="rounded-[1.5rem] border border-[var(--border)] bg-[var(--surface-2)] overflow-hidden flex flex-col xl:min-h-0">
                <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-5 py-4">
                  <div>
                    <p className="text-sm font-semibold text-[var(--text-primary)]">Eligible Entries</p>
                    <p className="text-xs text-[var(--text-muted)]">
                      {selectedCount} of {previewEntries.length} selected
                    </p>
                  </div>
                  <button
                    onClick={toggleAllSelected}
                    className="rounded-full border border-[var(--border)] bg-[var(--surface-1)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-3)] hover:text-[var(--text-primary)]"
                  >
                    {allSelected ? "Clear all" : "Select all"}
                  </button>
                </div>

                <div className="overflow-x-auto xl:min-h-0 xl:flex-1 xl:overflow-auto">
                  <table className="w-full">
                    <thead className="sticky top-0 bg-[var(--surface-2)]/95 backdrop-blur border-b border-[var(--border)]">
                      <tr>
                        <th className="px-4 py-3 text-left text-[11px] uppercase tracking-[0.18em] text-[var(--text-muted)]">
                          Include
                        </th>
                        <th className="px-4 py-3 text-left text-[11px] uppercase tracking-[0.18em] text-[var(--text-muted)]">
                          Date
                        </th>
                        <th className="px-4 py-3 text-left text-[11px] uppercase tracking-[0.18em] text-[var(--text-muted)]">
                          Description
                        </th>
                        <th className="px-4 py-3 text-right text-[11px] uppercase tracking-[0.18em] text-[var(--text-muted)]">
                          Hours
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border)]">
                      {previewEntries.map((entry) => {
                        const selected = selectedIds.has(entry.id);
                        return (
                          <tr
                            key={entry.id}
                            className={`transition-colors ${selected ? "bg-transparent" : "opacity-45"}`}
                          >
                            <td className="px-4 py-3 align-top">
                              <input
                                type="checkbox"
                                checked={selected}
                                onChange={() => toggleSelected(entry.id)}
                                className="accent-[var(--brand)]"
                              />
                            </td>
                            <td className="px-4 py-3 text-xs text-[var(--text-secondary)]">
                              {formatDate(entry.date)}
                            </td>
                            <td className="px-4 py-3 text-sm text-[var(--text-primary)]">
                              {entry.description || "—"}
                            </td>
                            <td className="px-4 py-3 text-right text-sm font-mono tabular-nums text-[var(--text-primary)]">
                              {((entry.duration_minutes ?? 0) / 60).toFixed(2)}h
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="space-y-4 xl:min-h-0 xl:overflow-auto">
                <div className="rounded-[1.5rem] border border-[var(--border)] bg-[var(--surface-2)] p-5">
                  <p className="text-sm font-semibold text-[var(--text-primary)]">Invoice Summary</p>
                  <div className="mt-4 space-y-2 text-sm">
                    <div className="flex justify-between text-[var(--text-secondary)]">
                      <span>Selected entries</span>
                      <span className="tabular-nums text-[var(--text-primary)]">{selectedCount}</span>
                    </div>
                    <div className="flex justify-between text-[var(--text-secondary)]">
                      <span>Total hours</span>
                      <span className="tabular-nums text-[var(--text-primary)]">{totalHours.toFixed(2)}h</span>
                    </div>
                    <div className="flex justify-between text-[var(--text-secondary)]">
                      <span>Rate</span>
                      <span className="text-[var(--text-primary)]">{formatCurrency(hourlyRate, currency)}/hr</span>
                    </div>
                    <div className="flex justify-between border-t border-[var(--border)] pt-3 font-semibold text-[var(--text-primary)]">
                      <span>Total</span>
                      <span className="tabular-nums">{formatCurrency(totalAmount, currency)}</span>
                    </div>
                  </div>

                  <div className="mt-4 rounded-2xl bg-[var(--surface-1)] p-4 text-xs text-[var(--text-secondary)]">
                    <p className="font-medium text-[var(--text-primary)]">
                      {trimmedInvoiceName || previewData.invoice_number || "Draft invoice"}
                    </p>
                    <p className="mt-1">
                      {formatDate(previewData.period_start)} – {formatDate(previewData.period_end)}
                    </p>
                  </div>
                </div>

                {format === "weekly" && (
                  <div className="rounded-[1.5rem] border border-[var(--border)] bg-[var(--surface-2)] p-5">
                    <p className="text-sm font-semibold text-[var(--text-primary)]">Weekly Notes</p>
                    <p className="mt-1 text-xs text-[var(--text-muted)]">
                      These notes will appear alongside each weekly summary in the PDF.
                    </p>
                    <div className="mt-4 space-y-3">
                      {calendarWeeks.map(({ isoWeek, label }) => (
                        <div key={isoWeek}>
                          <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">
                            {label}
                          </label>
                          <textarea
                            rows={2}
                            value={weekDescriptions[isoWeek] ?? ""}
                            onChange={(event) =>
                              setWeekDescriptions((previous) => ({
                                ...previous,
                                [isoWeek]: event.target.value,
                              }))
                            }
                            placeholder="Add a brief summary for this week…"
                            className="w-full resize-none rounded-xl border border-[var(--border)] bg-[var(--surface-1)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:border-[var(--brand)] focus:outline-none"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
              </div>
            </div>
          )}

          {step === "preview" && previewDocument && (
            <div className="flex flex-col gap-4 xl:grid xl:h-full xl:min-h-0 xl:grid-cols-[minmax(0,1.28fr)_340px]">
              <div className="h-[min(70vh,760px)] min-h-[420px] xl:h-full xl:min-h-0">
                <InvoicePdfViewer blob={previewBlob} />
              </div>

              <div className="space-y-4 xl:min-h-0 xl:overflow-auto">
                <div className="rounded-[1.5rem] border border-[var(--border)] bg-[var(--surface-2)] p-5">
                  <div className="flex items-center gap-2">
                    <div className="rounded-xl bg-[var(--surface-1)] p-2 text-[var(--brand)]">
                      <Eye size={18} />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-[var(--text-primary)]">Ready to confirm</p>
                      <p className="text-xs text-[var(--text-muted)]">
                        Go back if you need to change the included entries or weekly notes.
                      </p>
                    </div>
                  </div>

                  <div className="mt-5 space-y-2 text-sm">
                    <div className="flex justify-between text-[var(--text-secondary)]">
                      <span>Entries included</span>
                      <span className="tabular-nums text-[var(--text-primary)]">{selectedCount}</span>
                    </div>
                    <div className="flex justify-between text-[var(--text-secondary)]">
                      <span>Total hours</span>
                      <span className="tabular-nums text-[var(--text-primary)]">{totalHours.toFixed(2)}h</span>
                    </div>
                    <div className="flex justify-between text-[var(--text-secondary)]">
                      <span>Rate</span>
                      <span className="text-[var(--text-primary)]">{formatCurrency(hourlyRate, currency)}/hr</span>
                    </div>
                    <div className="flex justify-between border-t border-[var(--border)] pt-3 font-semibold text-[var(--text-primary)]">
                      <span>Total due</span>
                      <span className="tabular-nums">{formatCurrency(totalAmount, currency)}</span>
                    </div>
                  </div>
                </div>

                <div className="rounded-[1.5rem] border border-[var(--border)] bg-[var(--surface-2)] p-5">
                  <p className="text-sm font-semibold text-[var(--text-primary)]">Document Details</p>
                  <div className="mt-4 space-y-3 text-sm text-[var(--text-secondary)]">
                    <div>
                      <p className="text-xs uppercase tracking-[0.18em] text-[var(--text-muted)]">Name</p>
                      <p className="mt-1 text-[var(--text-primary)]">
                        {trimmedInvoiceName || "Auto-generated invoice number"}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-[0.18em] text-[var(--text-muted)]">Period</p>
                      <p className="mt-1 text-[var(--text-primary)]">
                        {formatDate(previewDocument.period_start)} – {formatDate(previewDocument.period_end)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-[0.18em] text-[var(--text-muted)]">Format</p>
                      <p className="mt-1 capitalize text-[var(--text-primary)]">
                        {format.replace("-", " ")}
                      </p>
                    </div>
                  </div>
                </div>

                {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-[var(--border)] px-4 py-4 sm:flex-row sm:items-center sm:justify-end sm:px-6">
          {step === "format" && (
            <>
              <button
                onClick={onClose}
                className="w-full rounded-xl px-4 py-2 text-sm text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-2)] sm:w-auto"
              >
                Cancel
              </button>
              <button
                onClick={() => setStep("period")}
                className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-[var(--brand)] px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--brand-hover)] sm:w-auto"
              >
                Next
                <ChevronRight size={15} />
              </button>
            </>
          )}

          {step === "period" && (
            <>
              <button
                onClick={() => {
                  setError("");
                  setStep("format");
                }}
                className="flex w-full items-center justify-center gap-1.5 rounded-xl px-4 py-2 text-sm text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-2)] sm:w-auto"
              >
                <ChevronLeft size={15} />
                Back
              </button>
              <button
                onClick={handlePeriodNext}
                disabled={loading}
                className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-[var(--brand)] px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--brand-hover)] disabled:opacity-50 sm:w-auto"
              >
                {loading ? "Loading…" : "Load Entries"}
                {!loading && <ChevronRight size={15} />}
              </button>
            </>
          )}

          {step === "select" && (
            <>
              <button
                onClick={() => {
                  setError("");
                  setStep("period");
                }}
                className="flex w-full items-center justify-center gap-1.5 rounded-xl px-4 py-2 text-sm text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-2)] sm:w-auto"
              >
                <ChevronLeft size={15} />
                Back
              </button>
              <button
                onClick={() => setStep("preview")}
                disabled={selectedCount === 0}
                className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-[var(--brand)] px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--brand-hover)] disabled:opacity-50 sm:w-auto"
              >
                Preview PDF
                <ChevronRight size={15} />
              </button>
            </>
          )}

          {step === "preview" && (
            <>
              <button
                onClick={() => {
                  setError("");
                  setStep("select");
                }}
                className="flex w-full items-center justify-center gap-1.5 rounded-xl px-4 py-2 text-sm text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-2)] sm:w-auto"
              >
                <ChevronLeft size={15} />
                Back to Selection
              </button>
              <button
                onClick={handleConfirm}
                disabled={loading || selectedCount === 0}
                className="w-full rounded-xl bg-[var(--brand)] px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--brand-hover)] disabled:opacity-50 sm:w-auto"
              >
                {loading ? "Saving…" : "Confirm Invoice"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
