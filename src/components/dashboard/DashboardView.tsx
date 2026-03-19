import { useEffect, useState } from "react";
import { getDashboardData, DashboardData } from "../../lib/commands";
import { useSettings } from "../../hooks/useSettings";
import { formatCurrency, formatMonthLabel } from "../../lib/dateUtils";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { Clock, Calendar, TrendingUp, BarChart3, type LucideIcon } from "lucide-react";

function StatCard({
  label,
  hours,
  earnings,
  currency,
  icon: Icon,
}: {
  label: string;
  hours: number;
  earnings: number;
  currency: string;
  icon: LucideIcon;
}) {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  const durationStr = `${h}h ${m.toString().padStart(2, "0")}m`;

  return (
    <div className="relative bg-[var(--surface-1)] border border-[var(--border)] rounded-xl p-4 border-l-2 overflow-hidden" style={{ borderLeftColor: "var(--brand)" }}>
      {/* Gradient overlay */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: "linear-gradient(135deg, var(--brand-muted) 0%, transparent 60%)",
        }}
      />
      {/* Icon top-right */}
      <Icon
        size={18}
        className="absolute top-4 right-4 text-[var(--text-muted)]"
        strokeWidth={1.5}
      />
      <div className="relative">
        <p className="text-[11px] text-[var(--text-muted)] uppercase tracking-wider mb-2">
          {label}
        </p>
        <p className="text-2xl font-bold text-[var(--text-primary)] tabular-nums">{durationStr}</p>
        <p className="text-sm text-[var(--brand)] mt-1 font-medium tabular-nums">
          {formatCurrency(earnings, currency)}
        </p>
      </div>
    </div>
  );
}

export function DashboardView() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const { settings } = useSettings();
  const currency = settings?.currency ?? "USD";

  useEffect(() => {
    getDashboardData()
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading || !data) {
    return (
      <div className="flex-1 flex items-center justify-center text-[var(--text-muted)]">
        Loading dashboard…
      </div>
    );
  }

  const chartColor = "#7c6fec";

  const tooltipStyle = {
    background: "var(--surface-2)",
    border: "1px solid var(--border-strong)",
    borderRadius: 10,
    fontSize: 12,
    boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
  };

  return (
    <div className="flex-1 overflow-auto">
      <div className="px-6 py-5 max-w-5xl mx-auto space-y-6">
        <h1 className="text-base font-semibold text-[var(--text-primary)]">Dashboard</h1>

        {/* Stat cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard label="This week"    hours={data.week_hours}       earnings={data.week_earnings}       currency={currency} icon={Clock} />
          <StatCard label="This month"   hours={data.month_hours}      earnings={data.month_earnings}      currency={currency} icon={Calendar} />
          <StatCard label="Last month"   hours={data.last_month_hours} earnings={data.last_month_earnings} currency={currency} icon={TrendingUp} />
          <StatCard label="Year to date" hours={data.ytd_hours}        earnings={data.ytd_earnings}        currency={currency} icon={BarChart3} />
        </div>

        {/* Daily bars */}
        <div className="bg-[var(--surface-1)] border border-[var(--border)] rounded-xl p-5">
          <h2 className="text-sm font-medium text-[var(--text-secondary)] mb-4">
            Daily hours — this month
          </h2>
          {data.daily_bars.length === 0 ? (
            <p className="text-center text-[var(--text-muted)] text-sm py-8">No data yet</p>
          ) : (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={data.daily_bars} barSize={18}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 10, fill: "var(--text-muted)" }}
                  tickFormatter={(v) => v.slice(8)}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: "var(--text-muted)" }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) => `${v}h`}
                />
                <Tooltip
                  contentStyle={tooltipStyle}
                  formatter={(v: unknown) => [`${(v as number).toFixed(2)}h`, "Hours"]}
                />
                <Bar dataKey="hours" fill={chartColor} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          {/* Weekly trend */}
          <div className="bg-[var(--surface-1)] border border-[var(--border)] rounded-xl p-5">
            <h2 className="text-sm font-medium text-[var(--text-secondary)] mb-4">
              Weekly trend (12 weeks)
            </h2>
            {data.weekly_trend.length === 0 ? (
              <p className="text-center text-[var(--text-muted)] text-sm py-8">No data yet</p>
            ) : (
              <ResponsiveContainer width="100%" height={160}>
                <LineChart data={data.weekly_trend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis
                    dataKey="week"
                    tick={{ fontSize: 9, fill: "var(--text-muted)" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 9, fill: "var(--text-muted)" }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => `${v}h`}
                  />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    formatter={(v: unknown) => [`${(v as number).toFixed(2)}h`, "Hours"]}
                  />
                  <Line
                    type="monotone"
                    dataKey="hours"
                    stroke={chartColor}
                    strokeWidth={2}
                    dot={{ fill: chartColor, r: 3 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Monthly bars */}
          <div className="bg-[var(--surface-1)] border border-[var(--border)] rounded-xl p-5">
            <h2 className="text-sm font-medium text-[var(--text-secondary)] mb-4">
              Monthly hours (12 months)
            </h2>
            {data.monthly_bars.length === 0 ? (
              <p className="text-center text-[var(--text-muted)] text-sm py-8">No data yet</p>
            ) : (
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={data.monthly_bars} barSize={20}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis
                    dataKey="month"
                    tick={{ fontSize: 9, fill: "var(--text-muted)" }}
                    tickFormatter={formatMonthLabel}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 9, fill: "var(--text-muted)" }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => `${v}h`}
                  />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    formatter={(v: unknown) => [`${(v as number).toFixed(2)}h`, "Hours"]}
                    labelFormatter={(label: unknown) => formatMonthLabel(label as string)}
                  />
                  <Bar dataKey="hours" fill={chartColor} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
