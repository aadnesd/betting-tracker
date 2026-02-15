"use client";

import { useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { type BalanceDataPoint, formatNOK } from "@/lib/reporting";

type GroupingOption = "day" | "week" | "month";

type BalanceChartProps = {
  data: BalanceDataPoint[];
  title?: string;
};

function CustomTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{
    value: number;
    dataKey: string;
    payload: BalanceDataPoint;
  }>;
}) {
  if (!active || !payload || payload.length === 0) {
    return null;
  }

  const dataPoint = payload[0].payload;
  const balanceColor =
    dataPoint.cumulative >= 0 ? "text-green-600" : "text-red-600";

  return (
    <div className="rounded-lg border bg-background p-3 shadow-lg">
      <p className="font-medium text-sm">{dataPoint.label}</p>
      <div className="mt-2 space-y-1 text-sm">
        <p className="text-muted-foreground">
          Total balance:{" "}
          <span className={balanceColor}>
            {formatNOK(dataPoint.cumulative)}
          </span>
        </p>
      </div>
    </div>
  );
}

export function BalanceChart({
  data,
  title = "Total Balance Over Time",
}: BalanceChartProps) {
  if (data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex h-64 items-center justify-center text-muted-foreground">
            No transactions to display
          </div>
        </CardContent>
      </Card>
    );
  }

  const finalCumulative = data[data.length - 1]?.cumulative ?? 0;
  const gradientColor = finalCumulative >= 0 ? "#22c55e" : "#ef4444";
  const strokeColor = finalCumulative >= 0 ? "#16a34a" : "#dc2626";

  const cumulativeValues = data.map((d) => d.cumulative);
  const minValue = Math.min(...cumulativeValues);
  const maxValue = Math.max(...cumulativeValues);
  const padding = Math.abs(maxValue - minValue) * 0.1 || 100;
  const yMin = Math.floor(minValue - padding);
  const yMax = Math.ceil(maxValue + padding);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-64 w-full">
          <ResponsiveContainer height="100%" width="100%">
            <AreaChart
              data={data}
              margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
            >
              <defs>
                <linearGradient
                  id="balanceGradient"
                  x1="0"
                  x2="0"
                  y1="0"
                  y2="1"
                >
                  <stop
                    offset="5%"
                    stopColor={gradientColor}
                    stopOpacity={0.3}
                  />
                  <stop
                    offset="95%"
                    stopColor={gradientColor}
                    stopOpacity={0}
                  />
                </linearGradient>
              </defs>
              <CartesianGrid className="stroke-muted" strokeDasharray="3 3" />
              <XAxis
                axisLine={false}
                className="text-muted-foreground"
                dataKey="label"
                interval="preserveStartEnd"
                tick={{ fontSize: 12 }}
                tickLine={false}
              />
              <YAxis
                axisLine={false}
                className="text-muted-foreground"
                domain={[yMin, yMax]}
                tick={{ fontSize: 12 }}
                tickFormatter={(value) =>
                  `${value >= 0 ? "" : "-"}${Math.abs(value)}`
                }
                tickLine={false}
              />
              <Tooltip content={<CustomTooltip />} />
              <Area
                activeDot={{ r: 4, strokeWidth: 2 }}
                dataKey="cumulative"
                dot={false}
                fill="url(#balanceGradient)"
                stroke={strokeColor}
                strokeWidth={2}
                type="monotone"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

type BalanceChartWithControlsProps = {
  dayData: BalanceDataPoint[];
  weekData: BalanceDataPoint[];
  monthData: BalanceDataPoint[];
  title?: string;
};

export function BalanceChartWithControls({
  dayData,
  weekData,
  monthData,
  title = "Cumulative Total Balance",
}: BalanceChartWithControlsProps) {
  const [grouping, setGrouping] = useState<GroupingOption>("day");

  const data =
    grouping === "day" ? dayData : grouping === "week" ? weekData : monthData;

  if (dayData.length === 0 && weekData.length === 0 && monthData.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex h-64 items-center justify-center text-muted-foreground">
            No transactions to display
          </div>
        </CardContent>
      </Card>
    );
  }

  const finalCumulative = data[data.length - 1]?.cumulative ?? 0;
  const gradientColor = finalCumulative >= 0 ? "#22c55e" : "#ef4444";
  const strokeColor = finalCumulative >= 0 ? "#16a34a" : "#dc2626";

  const cumulativeValues = data.map((d) => d.cumulative);
  const minValue = Math.min(...cumulativeValues);
  const maxValue = Math.max(...cumulativeValues);
  const padding = Math.abs(maxValue - minValue) * 0.1 || 100;
  const yMin = Math.floor(minValue - padding);
  const yMax = Math.ceil(maxValue + padding);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-lg">{title}</CardTitle>
        <div className="flex gap-1">
          {(["day", "week", "month"] as const).map((option) => (
            <button
              className={`rounded-md px-3 py-1 font-medium text-sm transition-colors ${
                grouping === option
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
              key={option}
              onClick={() => setGrouping(option)}
              type="button"
            >
              {option.charAt(0).toUpperCase() + option.slice(1)}
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-64 w-full">
          <ResponsiveContainer height="100%" width="100%">
            <AreaChart
              data={data}
              margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
            >
              <defs>
                <linearGradient
                  id="balanceGradientCtrl"
                  x1="0"
                  x2="0"
                  y1="0"
                  y2="1"
                >
                  <stop
                    offset="5%"
                    stopColor={gradientColor}
                    stopOpacity={0.3}
                  />
                  <stop
                    offset="95%"
                    stopColor={gradientColor}
                    stopOpacity={0}
                  />
                </linearGradient>
              </defs>
              <CartesianGrid className="stroke-muted" strokeDasharray="3 3" />
              <XAxis
                axisLine={false}
                className="text-muted-foreground"
                dataKey="label"
                interval="preserveStartEnd"
                tick={{ fontSize: 12 }}
                tickLine={false}
              />
              <YAxis
                axisLine={false}
                className="text-muted-foreground"
                domain={[yMin, yMax]}
                tick={{ fontSize: 12 }}
                tickFormatter={(value) =>
                  `${value >= 0 ? "" : "-"}${Math.abs(value)}`
                }
                tickLine={false}
              />
              <Tooltip content={<CustomTooltip />} />
              <Area
                activeDot={{ r: 4, strokeWidth: 2 }}
                dataKey="cumulative"
                dot={false}
                fill="url(#balanceGradientCtrl)"
                stroke={strokeColor}
                strokeWidth={2}
                type="monotone"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
