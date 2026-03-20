import { useEffect, useState } from "react";
import { getDashboardData, DashboardData } from "../../lib/commands";
import { useSettings } from "../../hooks/useSettings";
import { formatCurrency, formatDateShort, formatMonthLabel } from "../../lib/dateUtils";
import { format } from "date-fns";
import {
  BarChart, Bar, LineChart, Line,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";

function fmtH(hours: number): string {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return `${h}h ${m.toString().padStart(2, "0")}m`;
}

function pct(a: number, b: number): number | null {
  return b > 0 ? ((a - b) / b) * 100 : null;
}

function Delta({ v }: { v: number }) {
  const pos = v >= 0;
  return (
    <span className={`text-[10px] font-semibold tabular-nums ${pos ? "text-[var(--success)]" : "text-[var(--danger)]"}`}>
      {pos ? "+" : ""}{v.toFixed(1)}%
    </span>
  );
}

const tooltipStyle = {
  background: "var(--surface-2)",
  border: "1px solid var(--border-strong)",
  borderRadius: 4,
  fontSize: 11,
  color: "var(--text-primary)",
  boxShadow: "0 2px 8px rgba(0,0,0,0.25)",
};

export function DashboardView() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { settings } = useSettings();
  const currency = settings?.currency ?? "USD";

  useEffect(() => {
    setLoading(true);
    setError(null);
    getDashboardData()
      .then(setData)
      .catch((err) => {
        const message = err instanceof Error ? err.message : String(err);
        console.error(err);
        setError(message);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="flex-1 flex items-center justify-center text-[var(--text-muted)]">Loading…</div>;
  }

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="max-w-md rounded border border-[var(--danger)]/20 bg-[var(--surface-1)] px-4 py-3 text-center">
          <p className="text-sm font-semibold text-[var(--text-primary)]">Dashboard unavailable</p>
          <p className="mt-1 text-xs text-[var(--text-muted)]">{error}</p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex-1 flex items-center justify-center text-[var(--text-muted)]">
        No dashboard data yet
      </div>
    );
  }

  // Derived
  const todayStr = format(new Date(), "yyyy-MM-dd");
  const todayBar = data.daily_bars.find(d => d.date === todayStr);
  const todayHours = todayBar?.hours ?? 0;
  const todayEarnings = todayBar?.earnings ?? 0;

  const daysWorked = data.daily_bars.filter(d => d.hours > 0).length;
  const bestDay = data.daily_bars.reduce<typeof data.daily_bars[0] | null>(
    (max, d) => (!max || d.hours > max.hours ? d : max), null
  );
  const dailyAvg = daysWorked > 0 ? data.month_hours / daysWorked : 0;
  const dailyAvgEarnings = daysWorked > 0 ? data.month_earnings / daysWorked : 0;

  const now = new Date();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const dayOfMonth = now.getDate();
  const projectedHours = dayOfMonth > 0 ? (data.month_hours / dayOfMonth) * daysInMonth : 0;
  const projectedEarnings = dayOfMonth > 0 ? (data.month_earnings / dayOfMonth) * daysInMonth : 0;

  const momPct = pct(data.month_earnings, data.last_month_earnings);
  const wl = data.weekly_trend.length;
  const wowPct = wl >= 2
    ? pct(data.weekly_trend[wl - 1].earnings, data.weekly_trend[wl - 2].earnings)
    : null;

  // Monthly history newest-first
  const monthlyHistory = [...data.monthly_bars].reverse().slice(0, 8);

  const topStats = [
    { label: "TODAY",      hours: todayHours,              earnings: todayEarnings,              delta: null },
    { label: "THIS WEEK",  hours: data.week_hours,         earnings: data.week_earnings,         delta: wowPct },
    { label: "THIS MONTH", hours: data.month_hours,        earnings: data.month_earnings,        delta: momPct },
    { label: "LAST MONTH", hours: data.last_month_hours,   earnings: data.last_month_earnings,   delta: null },
    { label: "YTD",        hours: data.ytd_hours,          earnings: data.ytd_earnings,          delta: null },
    { label: "DAILY AVG",  hours: dailyAvg,                earnings: dailyAvgEarnings,           delta: null },
  ];

  const receivableStats = [
    {
      label: "UNPAID",
      value: formatCurrency(data.unpaid_amount, currency),
      detail: `${data.open_invoice_count} open ${data.open_invoice_count === 1 ? "invoice" : "invoices"}`,
      tone: "text-[var(--text-primary)]",
    },
    {
      label: "OVERDUE",
      value: formatCurrency(data.overdue_amount, currency),
      detail: `${data.overdue_invoice_count} overdue ${data.overdue_invoice_count === 1 ? "invoice" : "invoices"}`,
      tone: data.overdue_amount > 0 ? "text-[var(--danger)]" : "text-[var(--text-primary)]",
    },
    {
      label: "DUE SOON",
      value: formatCurrency(data.due_soon_amount, currency),
      detail: `${data.due_soon_invoice_count} due in 7 days`,
      tone: data.due_soon_amount > 0 ? "text-[var(--warning)]" : "text-[var(--text-primary)]",
    },
    {
      label: "COLLECTIONS",
      value: data.open_invoice_count === 0 ? "All clear" : `${data.client_receivables.length} clients`,
      detail: data.open_invoice_count === 0 ? "No outstanding invoices" : "Grouped by client",
      tone: "text-[var(--text-primary)]",
    },
  ];

  const monthStats = [
    { label: "Billable days", value: `${daysWorked} / ${daysInMonth}` },
    { label: "Daily average", value: fmtH(dailyAvg), sub: formatCurrency(dailyAvgEarnings, currency) },
    {
      label: "Best day",
      value: bestDay ? `${bestDay.date.slice(5).replace("-", "/")} · ${fmtH(bestDay.hours)}` : "—",
      sub: bestDay ? formatCurrency(bestDay.earnings, currency) : null,
    },
    {
      label: "Projected",
      value: fmtH(projectedHours),
      sub: formatCurrency(projectedEarnings, currency),
    },
    {
      label: "vs last month",
      value: momPct != null ? `${momPct >= 0 ? "+" : ""}${momPct.toFixed(1)}%` : "—",
      color: momPct != null ? (momPct >= 0 ? "var(--success)" : "var(--danger)") : undefined,
    },
  ];

  return (
    <div className="flex-1 overflow-auto">
      <div className="p-4 space-y-3">

        {/* Header */}
        <div className="flex items-baseline justify-between">
          <div>
            <h1 className="text-[13px] font-semibold text-[var(--text-primary)]">Dashboard</h1>
            <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
              Rounded billable time, effective rates, and open invoices
            </p>
          </div>
          <p className="text-[11px] text-[var(--text-muted)]">{format(now, "EEEE, MMMM d, yyyy")}</p>
        </div>

        {/* Top stats strip */}
        <div className="grid grid-cols-6 border border-[var(--border)] rounded overflow-hidden divide-x divide-[var(--border)]">
          {topStats.map(s => (
            <div key={s.label} className="bg-[var(--surface-1)] px-3 py-2.5 min-w-0">
              <p className="text-[9px] font-semibold tracking-widest text-[var(--text-muted)] uppercase mb-2">{s.label}</p>
              <p className="text-[15px] font-bold tabular-nums text-[var(--text-primary)] leading-none">{fmtH(s.hours)}</p>
              <div className="flex items-center justify-between mt-1.5 gap-1">
                <p className="text-[11px] text-[var(--text-secondary)] tabular-nums truncate">{formatCurrency(s.earnings, currency)}</p>
                {s.delta != null && <Delta v={s.delta} />}
              </div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-4 gap-3">
          {receivableStats.map((stat) => (
            <div key={stat.label} className="bg-[var(--surface-1)] border border-[var(--border)] rounded px-3 py-3">
              <p className="text-[9px] font-semibold tracking-widest text-[var(--text-muted)] uppercase mb-2">
                {stat.label}
              </p>
              <p className={`text-[16px] font-semibold leading-none ${stat.tone}`}>
                {stat.value}
              </p>
              <p className="text-[11px] text-[var(--text-muted)] mt-1.5">
                {stat.detail}
              </p>
            </div>
          ))}
        </div>

        {/* Middle: daily chart + month breakdown */}
        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2 bg-[var(--surface-1)] border border-[var(--border)] rounded p-3">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[11px] font-semibold text-[var(--text-secondary)] uppercase tracking-wider">Daily billable hours — this month</p>
              <p className="text-[11px] text-[var(--text-muted)] tabular-nums">{daysWorked} days · {fmtH(data.month_hours)}</p>
            </div>
            {data.daily_bars.length === 0 ? (
              <div className="h-[148px] flex items-center justify-center text-xs text-[var(--text-muted)]">No data yet</div>
            ) : (
              <ResponsiveContainer width="100%" height={148}>
                <BarChart data={data.daily_bars} barSize={10} margin={{ top: 2, right: 0, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="2 4" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 9, fill: "var(--text-muted)" }} tickFormatter={v => v.slice(8)} axisLine={false} tickLine={false} interval={1} />
                  <YAxis tick={{ fontSize: 9, fill: "var(--text-muted)" }} axisLine={false} tickLine={false} tickFormatter={v => `${v}h`} width={28} />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    formatter={(v: unknown) => [`${(v as number).toFixed(2)}h`, "Billable hours"]}
                    labelFormatter={(l, payload) => {
                      const point = payload?.[0]?.payload as { date?: string; earnings?: number } | undefined;
                      const earnings = point?.earnings ?? 0;
                      return `Day ${String(l).slice(8)} · ${formatCurrency(earnings, currency)}`;
                    }}
                    cursor={{ fill: "var(--surface-3)", opacity: 0.6 }}
                  />
                  <Bar dataKey="hours" fill="var(--brand)" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="bg-[var(--surface-1)] border border-[var(--border)] rounded p-3">
            <p className="text-[11px] font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-2.5">This month</p>
            <div>
              {monthStats.map(row => (
                <div key={row.label} className="flex items-baseline justify-between py-[7px] border-b border-[var(--border)] last:border-0 gap-2">
                  <span className="text-[11px] text-[var(--text-muted)] shrink-0">{row.label}</span>
                  <span className="text-[11px] font-medium tabular-nums text-right" style={{ color: row.color ?? "var(--text-primary)" }}>
                    {row.value}
                    {row.sub && <span className="text-[var(--text-muted)] font-normal"> · {row.sub}</span>}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Bottom: weekly trend + monthly history */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-[var(--surface-1)] border border-[var(--border)] rounded p-3">
            <p className="text-[11px] font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-3">Weekly billable trend — 12 weeks</p>
            {data.weekly_trend.length === 0 ? (
              <div className="h-[118px] flex items-center justify-center text-xs text-[var(--text-muted)]">No data yet</div>
            ) : (
              <ResponsiveContainer width="100%" height={118}>
                <LineChart data={data.weekly_trend} margin={{ top: 4, right: 4, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="2 4" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="week" tick={{ fontSize: 9, fill: "var(--text-muted)" }} axisLine={false} tickLine={false} tickFormatter={v => v.slice(5)} />
                  <YAxis tick={{ fontSize: 9, fill: "var(--text-muted)" }} axisLine={false} tickLine={false} tickFormatter={v => `${v}h`} width={28} />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    formatter={(v: unknown) => [`${(v as number).toFixed(2)}h`, "Billable hours"]}
                    labelFormatter={(l, payload) => {
                      const point = payload?.[0]?.payload as { earnings?: number } | undefined;
                      const earnings = point?.earnings ?? 0;
                      return `${String(l)} · ${formatCurrency(earnings, currency)}`;
                    }}
                  />
                  <Line type="monotone" dataKey="hours" stroke="var(--brand)" strokeWidth={1.5} dot={{ fill: "var(--brand)", r: 2 }} activeDot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="bg-[var(--surface-1)] border border-[var(--border)] rounded p-3">
            <p className="text-[11px] font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-2.5">Open receivables by client</p>
            {data.client_receivables.length === 0 ? (
              <div className="h-[118px] flex items-center justify-center text-xs text-[var(--text-muted)]">No outstanding invoices</div>
            ) : (
              <div className="divide-y divide-[var(--border)]">
                {data.client_receivables.map((client) => (
                  <div key={client.client_name} className="py-2 first:pt-0 last:pb-0">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[11px] font-medium text-[var(--text-primary)] truncate">
                          {client.client_name}
                        </p>
                        <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
                          {client.invoice_count} open · {client.overdue_count} overdue
                          {client.next_due_at ? ` · next ${formatDateShort(client.next_due_at)}` : ""}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-[11px] font-semibold tabular-nums text-[var(--text-primary)]">
                          {formatCurrency(client.open_amount, currency)}
                        </p>
                        <p className={`text-[10px] tabular-nums mt-0.5 ${client.overdue_amount > 0 ? "text-[var(--danger)]" : "text-[var(--text-muted)]"}`}>
                          {client.overdue_amount > 0
                            ? `${formatCurrency(client.overdue_amount, currency)} overdue`
                            : "Current"}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="bg-[var(--surface-1)] border border-[var(--border)] rounded p-3">
          <p className="text-[11px] font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-2.5">Monthly history</p>
          {monthlyHistory.length === 0 ? (
            <div className="h-[118px] flex items-center justify-center text-xs text-[var(--text-muted)]">No data yet</div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-[var(--border)]">
                  {["Month", "Billed hours", "Earnings", "MoM"].map(col => (
                    <th key={col} className="text-left text-[9px] font-semibold uppercase tracking-wider text-[var(--text-muted)] pb-1.5 pr-2 last:pr-0">{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {monthlyHistory.map((m, i) => {
                  const older = monthlyHistory[i + 1];
                  const delta = older ? pct(m.earnings, older.earnings) : null;
                  return (
                    <tr key={m.month} className="border-b border-[var(--border)] last:border-0">
                      <td className="py-1.5 text-[11px] text-[var(--text-secondary)] pr-2">{formatMonthLabel(m.month)}</td>
                      <td className="py-1.5 text-[11px] font-medium tabular-nums text-[var(--text-primary)] pr-2">{fmtH(m.hours)}</td>
                      <td className="py-1.5 text-[11px] tabular-nums text-[var(--text-secondary)] pr-2">
                        {formatCurrency(m.earnings, currency)}
                      </td>
                      <td className="py-1.5 text-[10px] tabular-nums font-semibold">
                        {delta != null
                          ? <span style={{ color: delta >= 0 ? "var(--success)" : "var(--danger)" }}>{delta >= 0 ? "+" : ""}{delta.toFixed(0)}%</span>
                          : <span className="text-[var(--text-muted)]">—</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

      </div>
    </div>
  );
}
