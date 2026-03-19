import { useEffect, useState } from "react";
import { getDashboardData, DashboardData } from "../../lib/commands";
import { useSettings } from "../../hooks/useSettings";
import { formatCurrency, formatMonthLabel } from "../../lib/dateUtils";
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
  const { settings } = useSettings();
  const currency = settings?.currency ?? "USD";
  const rate = parseFloat(settings?.hourly_rate ?? "0") || 0;

  useEffect(() => {
    getDashboardData().then(setData).catch(console.error).finally(() => setLoading(false));
  }, []);

  if (loading || !data) {
    return <div className="flex-1 flex items-center justify-center text-[var(--text-muted)]">Loading…</div>;
  }

  // Derived
  const todayStr = format(new Date(), "yyyy-MM-dd");
  const todayHours = data.daily_bars.find(d => d.date === todayStr)?.hours ?? 0;

  const daysWorked = data.daily_bars.filter(d => d.hours > 0).length;
  const bestDay = data.daily_bars.reduce<typeof data.daily_bars[0] | null>(
    (max, d) => (!max || d.hours > max.hours ? d : max), null
  );
  const dailyAvg = daysWorked > 0 ? data.month_hours / daysWorked : 0;

  const now = new Date();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const dayOfMonth = now.getDate();
  const projected = dayOfMonth > 0 ? (data.month_hours / dayOfMonth) * daysInMonth : 0;

  const momPct = pct(data.month_hours, data.last_month_hours);
  const wl = data.weekly_trend.length;
  const wowPct = wl >= 2 ? pct(data.weekly_trend[wl - 1].hours, data.weekly_trend[wl - 2].hours) : null;

  // Monthly history newest-first
  const monthlyHistory = [...data.monthly_bars].reverse().slice(0, 8);

  const topStats = [
    { label: "TODAY",      hours: todayHours,              earnings: todayHours * rate,          delta: null },
    { label: "THIS WEEK",  hours: data.week_hours,         earnings: data.week_earnings,         delta: wowPct },
    { label: "THIS MONTH", hours: data.month_hours,        earnings: data.month_earnings,        delta: momPct },
    { label: "LAST MONTH", hours: data.last_month_hours,   earnings: data.last_month_earnings,   delta: null },
    { label: "YTD",        hours: data.ytd_hours,          earnings: data.ytd_earnings,          delta: null },
    { label: "DAILY AVG",  hours: dailyAvg,                earnings: dailyAvg * rate,            delta: null },
  ];

  const monthStats = [
    { label: "Days worked",   value: `${daysWorked} / ${daysInMonth}` },
    { label: "Daily average", value: fmtH(dailyAvg) },
    { label: "Best day",      value: bestDay ? `${bestDay.date.slice(5).replace("-", "/")} · ${fmtH(bestDay.hours)}` : "—" },
    {
      label: "Projected",
      value: fmtH(projected),
      sub: rate > 0 ? formatCurrency(projected * rate, currency) : null,
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
          <h1 className="text-[13px] font-semibold text-[var(--text-primary)]">Dashboard</h1>
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

        {/* Middle: daily chart + month breakdown */}
        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2 bg-[var(--surface-1)] border border-[var(--border)] rounded p-3">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[11px] font-semibold text-[var(--text-secondary)] uppercase tracking-wider">Daily hours — this month</p>
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
                  <Tooltip contentStyle={tooltipStyle} formatter={(v: unknown) => [`${(v as number).toFixed(2)}h`, "Hours"]} labelFormatter={l => `Day ${String(l).slice(8)}`} cursor={{ fill: "var(--surface-3)", opacity: 0.6 }} />
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
            <p className="text-[11px] font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-3">Weekly trend — 12 weeks</p>
            {data.weekly_trend.length === 0 ? (
              <div className="h-[118px] flex items-center justify-center text-xs text-[var(--text-muted)]">No data yet</div>
            ) : (
              <ResponsiveContainer width="100%" height={118}>
                <LineChart data={data.weekly_trend} margin={{ top: 4, right: 4, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="2 4" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="week" tick={{ fontSize: 9, fill: "var(--text-muted)" }} axisLine={false} tickLine={false} tickFormatter={v => v.slice(5)} />
                  <YAxis tick={{ fontSize: 9, fill: "var(--text-muted)" }} axisLine={false} tickLine={false} tickFormatter={v => `${v}h`} width={28} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(v: unknown) => [`${(v as number).toFixed(2)}h`, "Hours"]} />
                  <Line type="monotone" dataKey="hours" stroke="var(--brand)" strokeWidth={1.5} dot={{ fill: "var(--brand)", r: 2 }} activeDot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="bg-[var(--surface-1)] border border-[var(--border)] rounded p-3">
            <p className="text-[11px] font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-2.5">Monthly history</p>
            {monthlyHistory.length === 0 ? (
              <div className="h-[118px] flex items-center justify-center text-xs text-[var(--text-muted)]">No data yet</div>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="border-b border-[var(--border)]">
                    {["Month", "Hours", "Est. earnings", "MoM"].map(col => (
                      <th key={col} className="text-left text-[9px] font-semibold uppercase tracking-wider text-[var(--text-muted)] pb-1.5 pr-2 last:pr-0">{col}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {monthlyHistory.map((m, i) => {
                    const older = monthlyHistory[i + 1];
                    const delta = older ? pct(m.hours, older.hours) : null;
                    return (
                      <tr key={m.month} className="border-b border-[var(--border)] last:border-0">
                        <td className="py-1.5 text-[11px] text-[var(--text-secondary)] pr-2">{formatMonthLabel(m.month)}</td>
                        <td className="py-1.5 text-[11px] font-medium tabular-nums text-[var(--text-primary)] pr-2">{fmtH(m.hours)}</td>
                        <td className="py-1.5 text-[11px] tabular-nums text-[var(--text-secondary)] pr-2">
                          {rate > 0 ? formatCurrency(m.hours * rate, currency) : "—"}
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
    </div>
  );
}
