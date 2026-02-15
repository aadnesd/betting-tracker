"use client";

import { useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { TransactionTrendPoint } from "@/lib/db/queries";

interface Props {
  data30: TransactionTrendPoint[];
  data90: TransactionTrendPoint[];
}

function formatValue(value: number): string {
  if (Math.abs(value) >= 1000) {
    return `${(value / 1000).toFixed(1)}k`;
  }
  return value.toFixed(0);
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{
    value: number;
    name: string;
    color: string;
  }>;
  label?: string;
}

function CustomTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) {
    return null;
  }

  return (
    <div className="rounded-lg border bg-background p-3 shadow-md">
      <p className="mb-2 font-medium">{label}</p>
      <div className="space-y-1 text-sm">
        {payload.map((entry) => (
          <div className="flex items-center gap-2" key={entry.name}>
            <div
              className="h-3 w-3 rounded-full"
              style={{ backgroundColor: entry.color }}
            />
            <span className="capitalize">{entry.name}:</span>
            <span className="font-medium">
              NOK{" "}
              {entry.value.toLocaleString(undefined, {
                minimumFractionDigits: 2,
              })}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Chart component showing deposit/withdrawal trends over time.
 * Supports 30-day (daily) and 90-day (weekly) views.
 * Why: Visualizes bankroll flow patterns to help users understand their capital movements.
 */
export function BankrollTransactionChart({ data30, data90 }: Props) {
  const [timeRange, setTimeRange] = useState<"30d" | "90d">("30d");
  const [chartType, setChartType] = useState<"bar" | "area">("bar");

  const data = timeRange === "30d" ? data30 : data90;

  if (data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Transaction Trends</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex h-[300px] items-center justify-center">
            <p className="text-muted-foreground">
              No transaction data available yet. Record deposits and withdrawals
              to see trends.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <CardTitle className="text-lg">Transaction Trends</CardTitle>
        <div className="flex gap-2">
          <div className="inline-flex h-8 items-center rounded-md border bg-muted p-0.5">
            <Button
              className="h-7 px-3 text-xs"
              onClick={() => setChartType("bar")}
              size="sm"
              variant={chartType === "bar" ? "secondary" : "ghost"}
            >
              Bar
            </Button>
            <Button
              className="h-7 px-3 text-xs"
              onClick={() => setChartType("area")}
              size="sm"
              variant={chartType === "area" ? "secondary" : "ghost"}
            >
              Area
            </Button>
          </div>
          <div className="inline-flex h-8 items-center rounded-md border bg-muted p-0.5">
            <Button
              className="h-7 px-3 text-xs"
              onClick={() => setTimeRange("30d")}
              size="sm"
              variant={timeRange === "30d" ? "secondary" : "ghost"}
            >
              30 Days
            </Button>
            <Button
              className="h-7 px-3 text-xs"
              onClick={() => setTimeRange("90d")}
              size="sm"
              variant={timeRange === "90d" ? "secondary" : "ghost"}
            >
              90 Days
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-[300px] w-full">
          <ResponsiveContainer height="100%" width="100%">
            {chartType === "bar" ? (
              <BarChart
                data={data}
                margin={{ top: 10, right: 10, left: 10, bottom: 0 }}
              >
                <CartesianGrid className="stroke-muted" strokeDasharray="3 3" />
                <XAxis
                  axisLine={false}
                  className="text-xs"
                  dataKey="label"
                  interval="preserveStartEnd"
                  tick={{ fontSize: 10 }}
                  tickLine={false}
                />
                <YAxis
                  axisLine={false}
                  className="text-xs"
                  tickFormatter={formatValue}
                  tickLine={false}
                  width={50}
                />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontSize: "12px" }} />
                <Bar
                  dataKey="deposits"
                  fill="#10b981"
                  name="Deposits"
                  radius={[4, 4, 0, 0]}
                />
                <Bar
                  dataKey="withdrawals"
                  fill="#ef4444"
                  name="Withdrawals"
                  radius={[4, 4, 0, 0]}
                />
                <Bar
                  dataKey="bonuses"
                  fill="#3b82f6"
                  name="Bonuses"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            ) : (
              <AreaChart
                data={data}
                margin={{ top: 10, right: 10, left: 10, bottom: 0 }}
              >
                <CartesianGrid className="stroke-muted" strokeDasharray="3 3" />
                <XAxis
                  axisLine={false}
                  className="text-xs"
                  dataKey="label"
                  interval="preserveStartEnd"
                  tick={{ fontSize: 10 }}
                  tickLine={false}
                />
                <YAxis
                  axisLine={false}
                  className="text-xs"
                  tickFormatter={formatValue}
                  tickLine={false}
                  width={50}
                />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontSize: "12px" }} />
                <Area
                  dataKey="deposits"
                  fill="#10b981"
                  fillOpacity={0.3}
                  name="Deposits"
                  stackId="1"
                  stroke="#10b981"
                  type="monotone"
                />
                <Area
                  dataKey="bonuses"
                  fill="#3b82f6"
                  fillOpacity={0.3}
                  name="Bonuses"
                  stackId="1"
                  stroke="#3b82f6"
                  type="monotone"
                />
                <Area
                  dataKey="withdrawals"
                  fill="#ef4444"
                  fillOpacity={0.3}
                  name="Withdrawals"
                  stroke="#ef4444"
                  type="monotone"
                />
              </AreaChart>
            )}
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
