import { Invoice, Settings } from "./commands";
import { formatCurrency, formatDate } from "./dateUtils";

export function buildInvoiceEmailSubject(invoice: Pick<Invoice, "invoice_number">): string {
  return `Invoice ${invoice.invoice_number}`;
}

export function buildInvoiceEmailBody({
  invoice,
  recipientName,
  senderName,
  currency,
}: {
  invoice: Pick<Invoice, "invoice_number" | "period_start" | "period_end" | "total_amount" | "due_at">;
  recipientName: string;
  senderName: string;
  currency: Settings["currency"];
}): string {
  const lines = [
    `Hi ${recipientName},`,
    "",
    `I'm sending invoice ${invoice.invoice_number} for ${formatDate(invoice.period_start)} - ${formatDate(invoice.period_end)}.`,
    `Total due: ${formatCurrency(invoice.total_amount, currency)}.`,
  ];

  if (invoice.due_at) {
    lines.push(`Due date: ${formatDate(invoice.due_at)}.`);
  }

  lines.push("", "Thanks,", senderName || "Your contractor");
  return lines.join("\n");
}

export function buildGmailComposeUrl({
  to,
  subject,
  body,
}: {
  to: string;
  subject: string;
  body: string;
}): string {
  const url = new URL("https://mail.google.com/mail/");
  url.searchParams.set("view", "cm");
  url.searchParams.set("fs", "1");
  url.searchParams.set("to", to);
  url.searchParams.set("su", subject);
  url.searchParams.set("body", body);
  return url.toString();
}
