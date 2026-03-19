import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { Invoice, InvoicePreview, Settings, TimeEntry } from "../../lib/commands";
import { formatDate, formatTime, formatCurrency } from "../../lib/dateUtils";

// ── Design constants ──────────────────────────────────────────────
const MARGIN  = 20;

const C_INK:    [number, number, number] = [28,  28,  36];       // primary body text
const C_MID:    [number, number, number] = [110, 110, 122];      // secondary / muted
const C_FAINT:  [number, number, number] = [214, 214, 220];      // rules / borders
const C_ACCENT: [number, number, number] = [36,  40,  50];        // table headers, accent rule
const C_WHITE:  [number, number, number] = [255, 255, 255];
const C_ROW_ALT:[number, number, number] = [250, 250, 253];      // alternate table rows

interface InvoicePdfData {
  invoice_number: string | null;
  period_start: string;
  period_end: string;
  total_hours: number;
  total_amount: number;
  hourly_rate: number;
  format: Invoice["format"];
  layout_data: string | null;
  name: string | null;
  issued_at: string;
}

function toInvoicePdfData(invoice: Invoice | InvoicePreview): InvoicePdfData {
  if ("created_at" in invoice) {
    return {
      invoice_number: invoice.invoice_number,
      period_start: invoice.period_start,
      period_end: invoice.period_end,
      total_hours: invoice.total_hours,
      total_amount: invoice.total_amount,
      hourly_rate: invoice.hourly_rate,
      format: invoice.format,
      layout_data: invoice.layout_data,
      name: invoice.name,
      issued_at: invoice.created_at,
    };
  }

  return {
    invoice_number: invoice.invoice_number,
    period_start: invoice.period_start,
    period_end: invoice.period_end,
    total_hours: invoice.total_hours,
    total_amount: invoice.total_amount,
    hourly_rate: invoice.hourly_rate,
    format: invoice.format,
    layout_data: invoice.layout_data,
    name: invoice.name,
    issued_at: invoice.issued_at,
  };
}

function invoiceFilename(invoice: Invoice | InvoicePreview): string {
  if (invoice.name) {
    return `${invoice.name.replace(/[^a-z0-9]/gi, "_")}.pdf`;
  }

  if ("invoice_number" in invoice && invoice.invoice_number) {
    return `${invoice.invoice_number}.pdf`;
  }

  return "invoice-preview.pdf";
}

// ── Shared header ─────────────────────────────────────────────────
// Pure typography — no fills, no bands. One thin accent rule is the only
// decorative element.  Returns Y after the bottom divider.
function drawSharedHeader(doc: jsPDF, invoice: InvoicePdfData, settings: Settings): number {
  const pageWidth = doc.internal.pageSize.getWidth();
  const usableW   = pageWidth - MARGIN * 2;
  let y = MARGIN;
  const invoiceNumberLabel = invoice.invoice_number ?? "Preview";

  // ── Title row ─────────────────────────────────────────────────────
  // When the invoice has a name: show it at 20pt with "INVOICE · number" as caption.
  // Otherwise: show "INVOICE" large with the number as caption below.
  const senderLines = [settings.user_name, settings.user_email].filter(Boolean);
  if (senderLines.length) {
    doc.setFontSize(9.5);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...C_INK);
    doc.text(senderLines[0], pageWidth - MARGIN, y - 1, { align: "right" });
    if (senderLines[1]) {
      doc.setFontSize(8.5);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...C_MID);
      doc.text(senderLines[1], pageWidth - MARGIN, y + 6, { align: "right" });
    }
  }

  if (invoice.name) {
    // Compact "INVOICE" label, then name large, then number small
    doc.setFontSize(7);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...C_MID);
    doc.text("INVOICE", MARGIN, y);

    doc.setFontSize(20);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...C_INK);
    doc.text(invoice.name, MARGIN, y + 8);

    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...C_MID);
    doc.text(invoiceNumberLabel, MARGIN, y + 15);

    y += 21; // taller title block
  } else {
    doc.setFontSize(26);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...C_INK);
    doc.text("INVOICE", MARGIN, y);

    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...C_MID);
    doc.text(invoiceNumberLabel, MARGIN, y + 8);

    y += 14;
  }

  // ── Thin accent rule ──────────────────────────────────────────────
  doc.setDrawColor(...C_ACCENT);
  doc.setLineWidth(0.5);
  doc.line(MARGIN, y, MARGIN + usableW, y);
  doc.setLineWidth(0.2);
  y += 6;

  // ── Period / Issued ───────────────────────────────────────────────
  doc.setFontSize(8.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...C_MID);
  doc.text(
    `Period: ${formatDate(invoice.period_start)} – ${formatDate(invoice.period_end)}`,
    MARGIN, y
  );
  doc.text(
    `Issued: ${formatDate(invoice.issued_at.slice(0, 10))}`,
    pageWidth - MARGIN, y, { align: "right" }
  );
  y += 11;

  // ── FROM / TO ─────────────────────────────────────────────────────
  const colW = (usableW - 10) / 2;

  doc.setFontSize(7);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...C_MID);
  doc.text("FROM", MARGIN, y);
  doc.text("BILLED TO", MARGIN + colW + 10, y);

  y += 5;
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...C_INK);

  const fromLines = [settings.user_name || "Your Name", settings.user_email || ""].filter(Boolean);
  const toLines   = [settings.employer_name || "Client"].filter(Boolean);
  fromLines.forEach((line, i) => {
    if (i === 0) {
      doc.setFontSize(10); doc.setFont("helvetica", "bold"); doc.setTextColor(...C_INK);
    } else {
      doc.setFontSize(8.5); doc.setFont("helvetica", "normal"); doc.setTextColor(...C_MID);
    }
    doc.text(line, MARGIN, y + i * 6);
  });
  toLines.forEach((line, i) => {
    doc.setFontSize(10); doc.setFont("helvetica", "bold"); doc.setTextColor(...C_INK);
    doc.text(line, MARGIN + colW + 10, y + i * 6);
  });

  y += Math.max(fromLines.length, toLines.length) * 6 + 10;

  // ── Bottom divider ────────────────────────────────────────────────
  doc.setDrawColor(...C_FAINT);
  doc.setLineWidth(0.3);
  doc.line(MARGIN, y, pageWidth - MARGIN, y);
  doc.setLineWidth(0.2);
  y += 7;

  return y;
}

// ── Totals block ──────────────────────────────────────────────────
function drawTotals(
  doc: jsPDF,
  startY: number,
  invoice: InvoicePdfData,
  currency: string,
  rate: number
): number {
  const pageWidth = doc.internal.pageSize.getWidth();
  const rightX  = pageWidth - MARGIN;
  const labelX  = rightX - 75;
  let y = startY;

  // Row 1: Total Hours
  doc.setFontSize(8.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...C_MID);
  doc.text("Total Hours", labelX, y);
  doc.text(`${invoice.total_hours.toFixed(2)} h`, rightX, y, { align: "right" });
  y += 5.5;

  // Row 2: Rate
  doc.text("Rate", labelX, y);
  doc.text(`${formatCurrency(rate, currency)} / hr`, rightX, y, { align: "right" });
  y += 5.5;

  // Thin divider
  doc.setDrawColor(...C_FAINT);
  doc.setLineWidth(0.3);
  doc.line(labelX, y, rightX, y);
  y += 5;

  // Row 3: Total Due — bold, slightly larger
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...C_INK);
  doc.text("Total Due", labelX, y);
  doc.text(formatCurrency(invoice.total_amount, currency), rightX, y, { align: "right" });
  y += 9;

  return y;
}

// ── Footer notes ──────────────────────────────────────────────────
function drawNotes(doc: jsPDF, startY: number, settings: Settings): void {
  if (!settings.invoice_notes) return;
  const pageWidth = doc.internal.pageSize.getWidth();

  doc.setDrawColor(...C_FAINT);
  doc.setLineWidth(0.25);
  doc.line(MARGIN, startY, pageWidth - MARGIN, startY);

  doc.setFontSize(7);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...C_MID);
  doc.text("NOTES", MARGIN, startY + 6);

  doc.setFontSize(8.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...C_INK);
  doc.text(settings.invoice_notes, MARGIN + 20, startY + 6);
}

// ── ISO week helper ───────────────────────────────────────────────
function getISOWeekStr(dateStr: string): string {
  const date = new Date(dateStr + "T00:00:00");
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

function weekRangeLabel(isoWeek: string): string {
  const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const [yearStr, wStr] = isoWeek.split("-W");
  const year = parseInt(yearStr);
  const week = parseInt(wStr);
  // Monday of ISO week
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = jan4.getUTCDay() || 7;
  const monday = new Date(jan4.getTime() + ((week - 1) * 7 - (jan4Day - 1)) * 86400000);
  const sunday = new Date(monday.getTime() + 6 * 86400000);
  return `${MONTHS[monday.getUTCMonth()]} ${monday.getUTCDate()}–${MONTHS[sunday.getUTCMonth()]} ${sunday.getUTCDate()}`;
}

// ── Format renderers ──────────────────────────────────────────────

function renderDetailed(
  doc: jsPDF,
  invoice: InvoicePdfData,
  entries: TimeEntry[],
  settings: Settings,
  currency: string,
  rate: number
): void {
  const y = drawSharedHeader(doc, invoice, settings);

  const rows: string[][] = [];
  for (const e of [...entries].sort((a, b) => a.date.localeCompare(b.date) || a.start_time.localeCompare(b.start_time))) {
    const hours = (e.duration_minutes ?? 0) / 60;
    rows.push([
      formatDate(e.date),
      `${formatTime(e.start_time)}–${e.end_time ? formatTime(e.end_time) : "?"}`,
      e.description || "—",
      hours.toFixed(2),
      formatCurrency(hours * rate, currency),
    ]);
  }

  autoTable(doc, {
    startY: y,
    head: [["Date", "Time", "Description", "Hours", "Amount"]],
    body: rows,
    margin: { left: MARGIN, right: MARGIN },
    styles: { fontSize: 8, cellPadding: 2, textColor: C_INK },
    headStyles: { fillColor: C_ACCENT, textColor: C_WHITE, fontSize: 7.5, fontStyle: "bold", cellPadding: 2 },
    alternateRowStyles: { fillColor: C_ROW_ALT },
    columnStyles: {
      0: { cellWidth: 26 },
      1: { cellWidth: 24 },
      2: { cellWidth: "auto" },
      3: { cellWidth: 16, halign: "right" },
      4: { cellWidth: 24, halign: "right" },
    },
  });

  const finalY = (doc as any).lastAutoTable.finalY + 8;
  const afterTotals = drawTotals(doc, finalY, invoice, currency, rate);
  drawNotes(doc, afterTotals + 8, settings);
}

function renderWeekly(
  doc: jsPDF,
  invoice: InvoicePdfData,
  entries: TimeEntry[],
  settings: Settings,
  currency: string,
  rate: number
): void {
  const y = drawSharedHeader(doc, invoice, settings);

  let weekDescriptions: Record<string, string> = {};
  if (invoice.layout_data) {
    try {
      weekDescriptions = JSON.parse(invoice.layout_data).week_descriptions ?? {};
    } catch { /* ignore */ }
  }

  // weekMap: isoWeek → dayOfWeek (0=Mon … 6=Sun) → total hours
  const weekMap = new Map<string, Map<number, number>>();
  for (const e of entries) {
    const isoWeek = getISOWeekStr(e.date);
    const date = new Date(e.date + "T00:00:00");
    const dow = date.getDay() === 0 ? 6 : date.getDay() - 1; // Mon=0, Sun=6
    const hours = (e.duration_minutes ?? 0) / 60;
    if (!weekMap.has(isoWeek)) weekMap.set(isoWeek, new Map());
    const dm = weekMap.get(isoWeek)!;
    dm.set(dow, (dm.get(dow) ?? 0) + hours);
  }

  const sortedWeeks = Array.from(weekMap.keys()).sort();

  // Build a Set of "rowIndex:colIndex" for day cells outside the invoice period.
  // Day cols are 1-indexed (col 0 = Week label, cols 1-7 = Mon-Sun).
  const outsidePeriod = new Set<string>();
  sortedWeeks.forEach((isoWeek, rowIdx) => {
    const [yearStr, wStr] = isoWeek.split("-W");
    const year = parseInt(yearStr);
    const week = parseInt(wStr);
    // Monday of this ISO week (UTC)
    const jan4 = new Date(Date.UTC(year, 0, 4));
    const jan4Day = jan4.getUTCDay() || 7;
    const monday = new Date(jan4.getTime() + ((week - 1) * 7 - (jan4Day - 1)) * 86400000);
    for (let dow = 0; dow < 7; dow++) {
      const dayDate = new Date(monday.getTime() + dow * 86400000);
      const dayStr = dayDate.toISOString().slice(0, 10);
      if (dayStr < invoice.period_start || dayStr > invoice.period_end) {
        outsidePeriod.add(`${rowIdx}:${dow + 1}`); // col offset +1 for the Week label col
      }
    }
  });

  const rows: string[][] = sortedWeeks.map((isoWeek) => {
    const dm = weekMap.get(isoWeek)!;
    const dayCells = [0, 1, 2, 3, 4, 5, 6].map((d) => {
      const h = dm.get(d);
      return h != null ? h.toFixed(1) : "";
    });
    const total = Array.from(dm.values()).reduce((a, b) => a + b, 0);
    return [weekRangeLabel(isoWeek), ...dayCells, total.toFixed(2), weekDescriptions[isoWeek] ?? ""];
  });

  autoTable(doc, {
    startY: y,
    head: [["Week", "M", "T", "W", "Th", "F", "Sa", "Su", "Total", "Description"]],
    body: rows,
    margin: { left: MARGIN, right: MARGIN },
    styles: { fontSize: 7, cellPadding: 1.8, textColor: C_INK },
    headStyles: { fillColor: C_ACCENT, textColor: C_WHITE, fontSize: 6.5, fontStyle: "bold", cellPadding: 1.8 },
    alternateRowStyles: { fillColor: C_ROW_ALT },
    columnStyles: {
      0: { cellWidth: 28 },
      1: { cellWidth: 13 },
      2: { cellWidth: 13 },
      3: { cellWidth: 13 },
      4: { cellWidth: 13 },
      5: { cellWidth: 13 },
      6: { cellWidth: 13 },
      7: { cellWidth: 13 },
      8: { cellWidth: 16, halign: "right" },
      9: { cellWidth: "auto" },
    },
    didParseCell: (data) => {
      if (data.section === "body" && outsidePeriod.has(`${data.row.index}:${data.column.index}`)) {
        data.cell.styles.fillColor = [232, 232, 238];
        data.cell.styles.textColor = [175, 175, 188];
      }
    },
  });

  const finalY = (doc as any).lastAutoTable.finalY + 8;
  const afterTotals = drawTotals(doc, finalY, invoice, currency, rate);
  drawNotes(doc, afterTotals + 8, settings);
}

function renderDaily(
  doc: jsPDF,
  invoice: InvoicePdfData,
  entries: TimeEntry[],
  settings: Settings,
  currency: string,
  rate: number
): void {
  const y = drawSharedHeader(doc, invoice, settings);

  const byDate = new Map<string, TimeEntry[]>();
  for (const e of entries) {
    if (!byDate.has(e.date)) byDate.set(e.date, []);
    byDate.get(e.date)!.push(e);
  }

  const rows: string[][] = [];
  for (const [date, dayEntries] of Array.from(byDate.entries()).sort()) {
    const hours = dayEntries.reduce((s, e) => s + (e.duration_minutes ?? 0) / 60, 0);
    const descs = [...new Set(dayEntries.map((e) => e.description).filter(Boolean))];
    const desc = descs.length === 1 ? descs[0] : descs.join(" / ") || "—";
    rows.push([formatDate(date), hours.toFixed(2), desc, formatCurrency(hours * rate, currency)]);
  }

  autoTable(doc, {
    startY: y,
    head: [["Date", "Hours", "Description", "Amount"]],
    body: rows,
    margin: { left: MARGIN, right: MARGIN },
    styles: { fontSize: 8, cellPadding: 2, textColor: C_INK },
    headStyles: { fillColor: C_ACCENT, textColor: C_WHITE, fontSize: 7.5, fontStyle: "bold", cellPadding: 2 },
    alternateRowStyles: { fillColor: C_ROW_ALT },
    columnStyles: {
      0: { cellWidth: 28 },
      1: { cellWidth: 18, halign: "right" },
      2: { cellWidth: "auto" },
      3: { cellWidth: 26, halign: "right" },
    },
  });

  const finalY = (doc as any).lastAutoTable.finalY + 8;
  const afterTotals = drawTotals(doc, finalY, invoice, currency, rate);
  drawNotes(doc, afterTotals + 8, settings);
}

function renderSimple(
  doc: jsPDF,
  invoice: InvoicePdfData,
  _entries: TimeEntry[],
  settings: Settings,
  currency: string,
  rate: number
): void {
  const pageWidth = doc.internal.pageSize.getWidth();
  let y = drawSharedHeader(doc, invoice, settings);

  // Single services-rendered block
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...C_INK);
  doc.text("Services rendered", MARGIN, y);
  doc.text(
    `${formatDate(invoice.period_start)} – ${formatDate(invoice.period_end)}`,
    pageWidth - MARGIN, y, { align: "right" }
  );
  y += 7;

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...C_MID);
  doc.text(
    `${invoice.total_hours.toFixed(2)}h @ ${formatCurrency(rate, currency)}/hr`,
    pageWidth - MARGIN, y, { align: "right" }
  );
  y += 14;

  doc.setDrawColor(...C_FAINT);
  doc.line(MARGIN, y, pageWidth - MARGIN, y);
  y += 8;

  const afterTotals = drawTotals(doc, y, invoice, currency, rate);
  drawNotes(doc, afterTotals + 8, settings);
}

function renderTypeBreakdown(
  doc: jsPDF,
  invoice: InvoicePdfData,
  entries: TimeEntry[],
  settings: Settings,
  currency: string,
  rate: number
): void {
  const y = drawSharedHeader(doc, invoice, settings);

  // Group by entry_type
  const grouped = new Map<string, TimeEntry[]>();
  for (const e of entries) {
    const t = e.tag_name || e.entry_type || "Untitled";
    if (!grouped.has(t)) grouped.set(t, []);
    grouped.get(t)!.push(e);
  }

  interface TypeRow { cells: string[]; isHeader: boolean }
  const typeRows: TypeRow[] = [];

  for (const [type, typeEntries] of Array.from(grouped.entries()).sort()) {
    const subHours = typeEntries.reduce((s, e) => s + (e.duration_minutes ?? 0) / 60, 0);
    const subAmount = subHours * rate;
    // Section header row
    typeRows.push({
      cells: [type.charAt(0).toUpperCase() + type.slice(1), "", subHours.toFixed(2), formatCurrency(subAmount, currency)],
      isHeader: true,
    });
    // Entry rows (description indented with leading spaces)
    for (const e of typeEntries) {
      const hours = (e.duration_minutes ?? 0) / 60;
      typeRows.push({
        cells: ["", "  " + (e.description || "—"), hours.toFixed(2), formatCurrency(hours * rate, currency)],
        isHeader: false,
      });
    }
  }

  autoTable(doc, {
    startY: y,
    head: [["Type", "Description", "Hours", "Amount"]],
    body: typeRows.map((r) => r.cells),
    margin: { left: MARGIN, right: MARGIN },
    styles: { fontSize: 8, cellPadding: 2, textColor: C_INK },
    headStyles: { fillColor: C_ACCENT, textColor: C_WHITE, fontSize: 7.5, fontStyle: "bold", cellPadding: 2 },
    columnStyles: {
      0: { cellWidth: 28 },
      1: { cellWidth: "auto" },
      2: { cellWidth: 18, halign: "right" },
      3: { cellWidth: 26, halign: "right" },
    },
    didParseCell: (data) => {
      if (data.section === "body") {
        const row = typeRows[data.row.index];
        if (row?.isHeader) {
          data.cell.styles.fontStyle = "bold";
          data.cell.styles.fillColor = [242, 242, 244] as [number, number, number];
          data.cell.styles.textColor = C_INK;
        }
      }
    },
  });

  const finalY = (doc as any).lastAutoTable.finalY + 8;
  const afterTotals = drawTotals(doc, finalY, invoice, currency, rate);
  drawNotes(doc, afterTotals + 8, settings);
}

function buildInvoicePDF(
  invoice: Invoice | InvoicePreview,
  entries: TimeEntry[],
  settings: Settings
): jsPDF {
  const doc = new jsPDF({ unit: "mm", format: "letter" });
  const invoiceData = toInvoicePdfData(invoice);
  const currency = settings.currency || "USD";
  const rate = invoiceData.hourly_rate || parseFloat(settings.hourly_rate) || 75;

  switch (invoiceData.format || "detailed") {
    case "weekly":
      renderWeekly(doc, invoiceData, entries, settings, currency, rate);
      break;
    case "daily":
      renderDaily(doc, invoiceData, entries, settings, currency, rate);
      break;
    case "simple":
      renderSimple(doc, invoiceData, entries, settings, currency, rate);
      break;
    case "type-breakdown":
      renderTypeBreakdown(doc, invoiceData, entries, settings, currency, rate);
      break;
    default:
      renderDetailed(doc, invoiceData, entries, settings, currency, rate);
  }

  return doc;
}

export function getInvoicePdfBlob(
  invoice: Invoice | InvoicePreview,
  entries: TimeEntry[],
  settings: Settings
): Blob {
  const doc = buildInvoicePDF(invoice, entries, settings);
  return new Blob([doc.output("arraybuffer") as ArrayBuffer], {
    type: "application/pdf",
  });
}

export function getInvoicePdfBlobUrl(
  invoice: Invoice | InvoicePreview,
  entries: TimeEntry[],
  settings: Settings
): string {
  return URL.createObjectURL(getInvoicePdfBlob(invoice, entries, settings));
}

export function downloadInvoicePDF(
  invoice: Invoice | InvoicePreview,
  entries: TimeEntry[],
  settings: Settings
): void {
  const doc = buildInvoicePDF(invoice, entries, settings);
  doc.save(invoiceFilename(invoice));
}
