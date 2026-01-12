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
import { formatNOK } from "@/lib/reporting";
import type { ExposureDataPoint } from "@/lib/db/queries";

type ExposureTimelineChartProps = {
  data: ExposureDataPoint[];
  title?: string;
  currentExposure?: number;
};

function CustomTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ value: number; dataKey: string; payload: ExposureDataPoint }>;
  label?: string;
}) {
  if (!active || !payload || payload.length === 0) {
    return null;
  }

  const dataPoint = payload[0].payload;

  return (
    <div className="rounded-lg border bg-background p-3 shadow-lg">
      <p className="font-medium text-sm">{dataPoint.label}</p>
      <div className="mt-2 space-y-1 text-sm">
        <p className="text-muted-foreground">
          Exposure:{" "}
          <span className={dataPoint.exposure > 0 ? "text-amber-600" : "text-green-600"}>
            {formatNOK(dataPoint.exposure)}
          </span>
        </p>
        <p className="text-muted-foreground">
          Open positions: <span className="text-foreground">{dataPoint.openPositions}</span>
        </p>
        {dataPoint.change !== 0 && (
          <p className="text-muted-foreground">
            Change:{" "}
            <span className={dataPoint.change > 0 ? "text-amber-600" : "text-green-600"}>
              {dataPoint.change > 0 ? "+" : ""}
              {formatNOK(dataPoint.change)}
            </span>
          </p>
        )}
      </div>
    </div>
  );
}

export function ExposureTimelineChart({
  data,
  title = "Exposure Over Time",
  currentExposure,
}: ExposureTimelineChartProps) {
  if (data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex h-64 items-center justify-center text-muted-foreground">
            No exposure data to display
          </div>
        </CardContent>
      </Card>
    );
  }

  // Use amber for exposure (risk) color theme
  const gradientColor = "#f59e0b"; // amber-500
  const strokeColor = "#d97706"; // amber-600

  // Calculate min/max for Y axis with some padding
  const exposureValues = data.map((d) => d.exposure);
  const minValue = Math.min(...exposureValues, 0);
  const maxValue = Math.max(...exposureValues, 0);
  const padding = Math.abs(maxValue - minValue) * 0.1 || 100;
  const yMin = Math.floor(Math.max(0, minValue - padding)); // Exposure shouldn't be negative
  const yMax = Math.ceil(maxValue + padding);

  // Get the current exposure value (last data point or provided value)
  const displayedCurrentExposure = currentExposure ?? data[data.length - 1]?.exposure ?? 0;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-lg">{title}</CardTitle>
        {displayedCurrentExposure > 0 && (
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Current:</span>
            <span className="font-semibold text-amber-600">
              {formatNOK(displayedCurrentExposure)}
            </span>
          </div>
        )}
      </CardHeader>
      <CardContent>
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="exposureGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={gradientColor} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={gradientColor} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 12 }}
                tickLine={false}
                axisLine={false}
                className="text-muted-foreground"
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fontSize: 12 }}
                tickLine={false}
                axisLine={false}
                className="text-muted-foreground"
                domain={[yMin, yMax]}
                tickFormatter={(value) => `${value >= 1000 ? `${(value / 1000).toFixed(0)}k` : value}`}
              />
              <Tooltip content={<CustomTooltip />} />
              <Area
                type="monotone"
                dataKey="exposure"
                stroke={strokeColor}
                strokeWidth={2}
                fill="url(#exposureGradient)"
                dot={false}
                activeDot={{ r: 4, strokeWidth: 2 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

type DaysOption = 7 | 14 | 30 | 90;

type ExposureTimelineWithControlsProps = {
  data7: ExposureDataPoint[];
  data14: ExposureDataPoint[];
  data30: ExposureDataPoint[];
  data90: ExposureDataPoint[];
  title?: string;
  currentExposure?: number;
};

export function ExposureTimelineWithControls({
  data7,
  data14,
  data30,
  data90,
  title = "Exposure Timeline",
  currentExposure,
}: ExposureTimelineWithControlsProps) {
  const [days, setDays] = useState<DaysOption>(30);

  const dataMap: Record<DaysOption, ExposureDataPoint[]> = {
    7: data7,
    14: data14,
    30: data30,
    90: data90,
  };

  const data = dataMap[days];
  const hasData = data7.length > 0 || data14.length > 0 || data30.length > 0 || data90.length > 0;

  if (!hasData) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex h-64 items-center justify-center text-muted-foreground">
            No exposure data to display
          </div>
        </CardContent>
      </Card>
    );
  }

  // Use amber for exposure (risk) color theme
  const gradientColor = "#f59e0b"; // amber-500
  const strokeColor = "#d97706"; // amber-600

  // Calculate min/max for Y axis with some padding
  const exposureValues = data.map((d) => d.exposure);
  const minValue = Math.min(...exposureValues, 0);
  const maxValue = Math.max(...exposureValues, 0);
  const padding = Math.abs(maxValue - minValue) * 0.1 || 100;
  const yMin = Math.floor(Math.max(0, minValue - padding));
  const yMax = Math.ceil(maxValue + padding);

  // Get the current exposure value
  const displayedCurrentExposure = currentExposure ?? data[data.length - 1]?.exposure ?? 0;

  const daysOptions: { value: DaysOption; label: string }[] = [
    { value: 7, label: "7d" },
    { value: 14, label: "14d" },
    { value: 30, label: "30d" },
    { value: 90, label: "90d" },
  ];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div className="flex items-center gap-4">
          <CardTitle className="text-lg">{title}</CardTitle>
          {displayedCurrentExposure > 0 && (
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">Current:</span>
              <span className="font-semibold text-amber-600">
                {formatNOK(displayedCurrentExposure)}
              </span>
            </div>
          )}
        </div>
        <div className="flex gap-1">
          {daysOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setDays(option.value)}
              className={`rounded-md px-3 py-1 text-sm font-medium transition-colors ${
                days === option.value
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="exposureGradientCtrl" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={gradientColor} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={gradientColor} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 12 }}
                tickLine={false}
                axisLine={false}
                className="text-muted-foreground"
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fontSize: 12 }}
                tickLine={false}
                axisLine={false}
                className="text-muted-foreground"
                domain={[yMin, yMax]}
                tickFormatter={(value) => `${value >= 1000 ? `${(value / 1000).toFixed(0)}k` : value}`}
              />
              <Tooltip content={<CustomTooltip />} />
              <Area
                type="monotone"
                dataKey="exposure"
                stroke={strokeColor}
                strokeWidth={2}
                fill="url(#exposureGradientCtrl)"
                dot={false}
                activeDot={{ r: 4, strokeWidth: 2 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
