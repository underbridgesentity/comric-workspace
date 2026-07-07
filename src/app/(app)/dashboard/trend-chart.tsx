"use client";

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export type TrendPoint = { week: string; pressure: number };

function TrendTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ value?: number | string }>;
  label?: string | number;
}) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="rounded-brand border border-hairline bg-surface px-3 py-2 shadow-lg">
      <p className="font-display text-[11px] font-bold tracking-wide text-muted uppercase">{label}</p>
      <p className="font-display text-sm font-black text-ink">
        {payload[0]?.value}
        <span className="ml-1 text-[11px] font-bold text-muted">weighted pressure</span>
      </p>
    </div>
  );
}

export function TrendChart({ data }: { data: TrendPoint[] }) {
  return (
    <div className="h-44 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: -20 }}>
          <defs>
            <linearGradient id="postureFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#8eff00" stopOpacity={0.35} />
              <stop offset="55%" stopColor="#03f8c5" stopOpacity={0.12} />
              <stop offset="100%" stopColor="#03f8c5" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="currentColor" className="text-ink/5" vertical={false} strokeDasharray="3 6" />
          <XAxis
            dataKey="week"
            tickLine={false}
            axisLine={false}
            tick={{ fill: "var(--muted)", fontSize: 11 }}
            dy={6}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            tick={{ fill: "var(--muted)", fontSize: 11 }}
            width={44}
            allowDecimals={false}
          />
          <Tooltip content={<TrendTooltip />} cursor={{ stroke: "var(--hairline)" }} />
          <Area
            type="monotone"
            dataKey="pressure"
            stroke="#8eff00"
            strokeWidth={2}
            fill="url(#postureFill)"
            animationDuration={900}
            animationEasing="ease-out"
            dot={false}
            activeDot={{ r: 4, fill: "#8eff00", stroke: "var(--surface)", strokeWidth: 2 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
