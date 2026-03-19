import { Client, Settings, TimeEntry } from "./commands";
import { formatCurrency } from "./dateUtils";

export interface BilledEntry {
  entry: TimeEntry;
  roundedMinutes: number;
  billedHours: number;
  effectiveRate: number | null;
  amount: number;
}

export interface InvoiceBillingSummary {
  totalHours: number;
  totalAmount: number;
  distinctRates: number[];
  hasMixedRates: boolean;
}

function roundCurrency(amount: number): number {
  return Math.round(amount * 100) / 100;
}

export function applyInvoiceRounding(minutes: number, rounding: Settings["time_rounding"] | string): number {
  switch (rounding) {
    case "15":
      return Math.ceil(minutes / 15) * 15;
    case "30":
      return Math.ceil(minutes / 30) * 30;
    case "60":
      return Math.ceil(minutes / 60) * 60;
    default:
      return minutes;
  }
}

export function getBilledEntry(
  entry: TimeEntry,
  defaultRate: number,
  rounding: Settings["time_rounding"] | string
): BilledEntry {
  const roundedMinutes = applyInvoiceRounding(entry.duration_minutes ?? 0, rounding);
  if (!entry.billable) {
    return {
      entry,
      roundedMinutes,
      billedHours: 0,
      effectiveRate: null,
      amount: 0,
    };
  }

  const effectiveRate = entry.hourly_rate ?? defaultRate;
  const billedHours = roundedMinutes / 60;

  return {
    entry,
    roundedMinutes,
    billedHours,
    effectiveRate,
    amount: roundCurrency(billedHours * effectiveRate),
  };
}

export function summarizeInvoiceEntries(
  entries: TimeEntry[],
  defaultRate: number,
  rounding: Settings["time_rounding"] | string
): InvoiceBillingSummary {
  const distinctRates = new Map<string, number>();
  let totalHours = 0;
  let totalAmount = 0;

  for (const entry of entries) {
    const billed = getBilledEntry(entry, defaultRate, rounding);
    totalHours += billed.billedHours;
    totalAmount += billed.amount;
    if (billed.effectiveRate != null) {
      distinctRates.set(billed.effectiveRate.toFixed(6), billed.effectiveRate);
    }
  }

  return {
    totalHours: roundCurrency(totalHours),
    totalAmount: roundCurrency(totalAmount),
    distinctRates: Array.from(distinctRates.values()).sort((a, b) => a - b),
    hasMixedRates: distinctRates.size > 1,
  };
}

export function getInvoiceRateLabel(
  summary: InvoiceBillingSummary,
  defaultRate: number,
  currency: string
): string {
  if (summary.hasMixedRates) {
    return "Mixed rates";
  }

  const rate = summary.distinctRates[0] ?? defaultRate;
  return `${formatCurrency(rate, currency)}/hr`;
}

export function getBillingContact(
  client: Client | null | undefined,
  fallbackName = ""
): { name: string; email: string | null } {
  const name = client?.billing_name?.trim() || client?.name || fallbackName || "Client";
  const email = client?.billing_email?.trim() || null;

  return { name, email };
}
