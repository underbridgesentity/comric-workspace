"use client";

import type { ReactNode } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, SEVERITY_COLORS } from "@/components/ui";
import type { Severity } from "@/lib/schema";

const CYBER = "#8eff00";
const DIGITAL = "#03f8c5";
const NETWORK = "#006d5b";
const MUTED = "#7a8794";
const HAIRLINE = "rgba(122,135,148,0.18)";

const CATEGORY_PALETTE = [DIGITAL, CYBER, NETWORK, "#f59e0b", "#8b5cf6", MUTED];

function ChartCard({
  title,
  insight,
  children,
  className = "",
}: {
  title: string;
  insight: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card className={`flex flex-col p-5 ${className}`}>
      <h2 className="font-display text-sm font-bold text-ink">{title}</h2>
      <p className="mt-0.5 mb-3 text-xs text-muted">{insight}</p>
      <div className="h-64 min-w-0 shrink-0">{children}</div>
    </Card>
  );
}

const tooltipStyle = {
  backgroundColor: "#101820",
  border: `1px solid ${HAIRLINE}`,
  borderRadius: 8,
  color: "#e8eef4",
  fontSize: 12,
};

type Datum = { name: string; value: number };

export function AnalyticsCharts({
  severityData,
  categoryData,
  weeklyData,
  keywordData,
  scrapeVolume,
  insights,
}: {
  severityData: Datum[];
  categoryData: Datum[];
  weeklyData: { week: string; risks: number }[];
  keywordData: Datum[];
  scrapeVolume: { day: string; results: number }[];
  insights: Record<"severity" | "category" | "weekly" | "keywords" | "scrape", string>;
}) {
  const hasSeverity = severityData.some((d) => d.value > 0);
  const hasCategory = categoryData.some((d) => d.value > 0);
  const severitySlices = severityData.filter((d) => d.value > 0);

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {/* Severity donut */}
      <ChartCard title="Risk severity distribution" insight={insights.severity}>
        {hasSeverity ? (
          severitySlices.length === 1 ? (
            // Recharts renders no sectors for a single-datum pie; draw the
            // full ring directly so a one-severity register still charts.
            <div className="flex h-full items-center justify-center">
              <svg viewBox="0 0 200 200" className="h-full max-h-56">
                <circle
                  cx="100"
                  cy="100"
                  r="68"
                  fill="none"
                  strokeWidth="26"
                  stroke={SEVERITY_COLORS[severitySlices[0].name as Severity]}
                />
                <text
                  x="100"
                  y="94"
                  textAnchor="middle"
                  className="fill-ink font-display"
                  style={{ fontSize: 34, fontWeight: 900, fill: "currentColor" }}
                >
                  {severitySlices[0].value}
                </text>
                <text
                  x="100"
                  y="120"
                  textAnchor="middle"
                  style={{
                    fontSize: 13,
                    fontWeight: 700,
                    letterSpacing: 2,
                    textTransform: "uppercase",
                    fill: SEVERITY_COLORS[severitySlices[0].name as Severity],
                  }}
                >
                  {severitySlices[0].name}
                </text>
              </svg>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={severitySlices}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius="55%"
                  outerRadius="80%"
                  paddingAngle={3}
                  stroke="none"
                >
                  {severitySlices.map((d) => (
                    <Cell key={d.name} fill={SEVERITY_COLORS[d.name as Severity]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} />
              </PieChart>
            </ResponsiveContainer>
          )
        ) : (
          <NoData />
        )}
      </ChartCard>

      {/* Category bar */}
      <ChartCard title="Risks by category" insight={insights.category}>
        {hasCategory ? (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={categoryData} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
              <CartesianGrid stroke={HAIRLINE} vertical={false} />
              <XAxis
                dataKey="name"
                tick={{ fill: MUTED, fontSize: 11 }}
                axisLine={{ stroke: HAIRLINE }}
                tickLine={false}
              />
              <YAxis
                allowDecimals={false}
                tick={{ fill: MUTED, fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "rgba(122,135,148,0.08)" }} />
              <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={44}>
                {categoryData.map((d, i) => (
                  <Cell key={d.name} fill={CATEGORY_PALETTE[i % CATEGORY_PALETTE.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <NoData />
        )}
      </ChartCard>

      {/* Risks over time - gradient area, full width */}
      <ChartCard title="Risks logged - last 12 weeks" insight={insights.weekly} className="lg:col-span-2">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={weeklyData} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
            <defs>
              <linearGradient id="riskArea" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={DIGITAL} stopOpacity={0.35} />
                <stop offset="100%" stopColor={DIGITAL} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke={HAIRLINE} vertical={false} />
            <XAxis
              dataKey="week"
              tick={{ fill: MUTED, fontSize: 11 }}
              axisLine={{ stroke: HAIRLINE }}
              tickLine={false}
            />
            <YAxis
              allowDecimals={false}
              tick={{ fill: MUTED, fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip contentStyle={tooltipStyle} />
            <Area
              type="monotone"
              dataKey="risks"
              stroke={DIGITAL}
              strokeWidth={2}
              fill="url(#riskArea)"
              dot={{ r: 2.5, fill: DIGITAL, strokeWidth: 0 }}
              activeDot={{ r: 4, fill: CYBER, strokeWidth: 0 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* Top keywords - horizontal bar */}
      <ChartCard title="Top matched keywords" insight={insights.keywords}>
        {keywordData.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={keywordData}
              layout="vertical"
              margin={{ top: 4, right: 16, left: 8, bottom: 0 }}
            >
              <CartesianGrid stroke={HAIRLINE} horizontal={false} />
              <XAxis
                type="number"
                allowDecimals={false}
                tick={{ fill: MUTED, fontSize: 11 }}
                axisLine={{ stroke: HAIRLINE }}
                tickLine={false}
              />
              <YAxis
                type="category"
                dataKey="name"
                width={110}
                tick={{ fill: MUTED, fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "rgba(122,135,148,0.08)" }} />
              <Bar dataKey="value" fill={NETWORK} radius={[0, 4, 4, 0]} maxBarSize={18}>
                {keywordData.map((d, i) => (
                  <Cell key={d.name} fill={i === 0 ? DIGITAL : NETWORK} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <NoData />
        )}
      </ChartCard>

      {/* Scrape volume line */}
      <ChartCard title="Scrape volume - last 14 days" insight={insights.scrape}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={scrapeVolume} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
            <CartesianGrid stroke={HAIRLINE} vertical={false} />
            <XAxis
              dataKey="day"
              tick={{ fill: MUTED, fontSize: 10 }}
              axisLine={{ stroke: HAIRLINE }}
              tickLine={false}
              interval={1}
            />
            <YAxis
              allowDecimals={false}
              tick={{ fill: MUTED, fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip contentStyle={tooltipStyle} />
            <Line
              type="monotone"
              dataKey="results"
              stroke={CYBER}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, fill: CYBER, strokeWidth: 0 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  );
}

function NoData() {
  return (
    <div className="flex h-full items-center justify-center text-sm text-muted">
      No data yet - charts populate as the pipeline runs.
    </div>
  );
}
