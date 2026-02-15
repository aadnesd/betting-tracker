"use client";

import { useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatNOK, formatPercentage } from "@/lib/reporting";
import { cn } from "@/lib/utils";

/**
 * Breakdown data point for chart visualization.
 */
export type BreakdownDataPoint = {
  name: string;
  count: number;
  totalProfitLoss: number;
  totalStake: number;
  roi: number;
};

type ChartType = "bar" | "pie";

type BreakdownChartProps = {
  title: string;
  data: BreakdownDataPoint[];
  emptyMessage?: string;
  className?: string;
  onItemClick?: (item: BreakdownDataPoint) => void;
};

// Color palette for charts
const COLORS = [
  "#22c55e", // green-500
  "#3b82f6", // blue-500
  "#f59e0b", // amber-500
  "#8b5cf6", // violet-500
  "#ec4899", // pink-500
  "#14b8a6", // teal-500
  "#f97316", // orange-500
  "#6366f1", // indigo-500
];

// Negative color palette
const NEGATIVE_COLORS = [
  "#ef4444", // red-500
  "#dc2626", // red-600
  "#b91c1c", // red-700
];

function getBarColor(value: number, index: number): string {
  if (value < 0) {
    return NEGATIVE_COLORS[index % NEGATIVE_COLORS.length];
  }
  return COLORS[index % COLORS.length];
}

function CustomBarTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{
    value: number;
    dataKey: string;
    payload: BreakdownDataPoint;
  }>;
}) {
  if (!active || !payload || payload.length === 0) {
    return null;
  }

  const dataPoint = payload[0].payload;

  return (
    <div className="rounded-lg border bg-background p-3 shadow-lg">
      <p className="font-medium text-sm">{dataPoint.name}</p>
      <div className="mt-2 space-y-1 text-sm">
        <p className="text-muted-foreground">
          Profit:{" "}
          <span
            className={
              dataPoint.totalProfitLoss >= 0 ? "text-green-600" : "text-red-600"
            }
          >
            {formatNOK(dataPoint.totalProfitLoss)}
          </span>
        </p>
        <p className="text-muted-foreground">
          Stake:{" "}
          <span className="text-foreground">
            {formatNOK(dataPoint.totalStake)}
          </span>
        </p>
        <p className="text-muted-foreground">
          ROI:{" "}
          <span
            className={dataPoint.roi >= 0 ? "text-green-600" : "text-red-600"}
          >
            {formatPercentage(dataPoint.roi)}
          </span>
        </p>
        <p className="text-muted-foreground">
          Bets: <span className="text-foreground">{dataPoint.count}</span>
        </p>
      </div>
    </div>
  );
}

function CustomPieTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{
    value: number;
    dataKey: string;
    payload: BreakdownDataPoint & { fill: string };
  }>;
}) {
  if (!active || !payload || payload.length === 0) {
    return null;
  }

  const dataPoint = payload[0].payload;

  return (
    <div className="rounded-lg border bg-background p-3 shadow-lg">
      <p className="font-medium text-sm">{dataPoint.name}</p>
      <div className="mt-2 space-y-1 text-sm">
        <p className="text-muted-foreground">
          Profit:{" "}
          <span
            className={
              dataPoint.totalProfitLoss >= 0 ? "text-green-600" : "text-red-600"
            }
          >
            {formatNOK(dataPoint.totalProfitLoss)}
          </span>
        </p>
        <p className="text-muted-foreground">
          Stake:{" "}
          <span className="text-foreground">
            {formatNOK(dataPoint.totalStake)}
          </span>
        </p>
        <p className="text-muted-foreground">
          ROI:{" "}
          <span
            className={dataPoint.roi >= 0 ? "text-green-600" : "text-red-600"}
          >
            {formatPercentage(dataPoint.roi)}
          </span>
        </p>
        <p className="text-muted-foreground">
          Bets: <span className="text-foreground">{dataPoint.count}</span>
        </p>
      </div>
    </div>
  );
}

/**
 * Breakdown bar chart component displaying profit by category.
 *
 * Features:
 * - Color-coded bars (green for profit, red for loss)
 * - Hover tooltips with profit, stake, ROI, and bet count
 * - Clickable bars for filtering (if onItemClick provided)
 * - Sorted by profit descending
 */
export function BreakdownBarChart({
  title,
  data,
  emptyMessage = "No data available",
  className,
  onItemClick,
}: BreakdownChartProps) {
  // Sort by profit descending
  const sortedData = [...data].sort(
    (a, b) => b.totalProfitLoss - a.totalProfitLoss
  );

  if (sortedData.length === 0) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="text-lg">{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex h-48 items-center justify-center text-muted-foreground">
            {emptyMessage}
          </div>
        </CardContent>
      </Card>
    );
  }

  // Calculate min/max for Y axis
  const values = sortedData.map((d) => d.totalProfitLoss);
  const minValue = Math.min(...values, 0);
  const maxValue = Math.max(...values, 0);
  const padding = Math.abs(maxValue - minValue) * 0.1 || 100;
  const yMin = Math.floor(minValue - padding);
  const yMax = Math.ceil(maxValue + padding);

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="text-lg">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-48 w-full">
          <ResponsiveContainer height="100%" width="100%">
            <BarChart
              data={sortedData}
              margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
            >
              <CartesianGrid className="stroke-muted" strokeDasharray="3 3" />
              <XAxis
                angle={-45}
                axisLine={false}
                className="text-muted-foreground"
                dataKey="name"
                height={60}
                interval={0}
                textAnchor="end"
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
              <Tooltip content={<CustomBarTooltip />} />
              <Bar
                cursor={onItemClick ? "pointer" : "default"}
                dataKey="totalProfitLoss"
                onClick={(_data, _index, event) => {
                  // The payload contains our original data
                  const payload = (
                    _data as unknown as { payload?: BreakdownDataPoint }
                  ).payload;
                  if (payload && onItemClick) {
                    onItemClick(payload);
                  }
                }}
                radius={[4, 4, 0, 0]}
              >
                {sortedData.map((entry, index) => (
                  <Cell
                    fill={getBarColor(entry.totalProfitLoss, index)}
                    key={`cell-${entry.name}`}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Breakdown pie chart component displaying profit distribution.
 *
 * Features:
 * - Color-coded segments
 * - Hover tooltips with profit, stake, ROI, and bet count
 * - Clickable segments for filtering (if onItemClick provided)
 * - Uses absolute values for sizing (with color indicating profit/loss)
 */
export function BreakdownPieChart({
  title,
  data,
  emptyMessage = "No data available",
  className,
  onItemClick,
}: BreakdownChartProps) {
  // Sort by absolute profit descending for pie display
  const sortedData = [...data].sort(
    (a, b) => Math.abs(b.totalProfitLoss) - Math.abs(a.totalProfitLoss)
  );

  if (sortedData.length === 0) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="text-lg">{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex h-48 items-center justify-center text-muted-foreground">
            {emptyMessage}
          </div>
        </CardContent>
      </Card>
    );
  }

  // Transform data for pie chart (use absolute values for sizing)
  const pieData = sortedData.map((item, index) => ({
    ...item,
    value: Math.abs(item.totalProfitLoss) || 0.01, // Prevent zero-size slices
    fill:
      item.totalProfitLoss >= 0
        ? COLORS[index % COLORS.length]
        : NEGATIVE_COLORS[0],
  }));

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="text-lg">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-48 w-full">
          <ResponsiveContainer height="100%" width="100%">
            <PieChart>
              <Pie
                cursor={onItemClick ? "pointer" : "default"}
                cx="50%"
                cy="50%"
                data={pieData}
                dataKey="value"
                innerRadius={35}
                nameKey="name"
                onClick={(data) => {
                  // Data is the pie segment data
                  const item = data as unknown as BreakdownDataPoint;
                  if (item && onItemClick) {
                    onItemClick(item);
                  }
                }}
                outerRadius={70}
                paddingAngle={2}
              >
                {pieData.map((entry) => (
                  <Cell fill={entry.fill} key={`cell-${entry.name}`} />
                ))}
              </Pie>
              <Tooltip content={<CustomPieTooltip />} />
            </PieChart>
          </ResponsiveContainer>
        </div>
        {/* Legend */}
        <div className="mt-2 flex flex-wrap justify-center gap-2 text-xs">
          {pieData.slice(0, 6).map((entry) => (
            <div
              className="flex cursor-pointer items-center gap-1 hover:opacity-80"
              key={entry.name}
              onClick={() => onItemClick?.(entry)}
            >
              <div
                className="h-3 w-3 rounded-sm"
                style={{ backgroundColor: entry.fill }}
              />
              <span className="text-muted-foreground">{entry.name}</span>
            </div>
          ))}
          {pieData.length > 6 && (
            <span className="text-muted-foreground">
              +{pieData.length - 6} more
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Combined breakdown chart with toggle between bar and pie views.
 *
 * Features:
 * - Toggle between bar and pie chart views
 * - All features from individual chart components
 * - Consistent styling and interactions
 */
export function BreakdownChartWithToggle({
  title,
  data,
  emptyMessage = "No data available",
  className,
  onItemClick,
  defaultView = "bar",
}: BreakdownChartProps & { defaultView?: ChartType }) {
  const [chartType, setChartType] = useState<ChartType>(defaultView);

  if (data.length === 0) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="text-lg">{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex h-48 items-center justify-center text-muted-foreground">
            {emptyMessage}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-lg">{title}</CardTitle>
        <div className="flex gap-1">
          {(["bar", "pie"] as const).map((option) => (
            <button
              className={cn(
                "rounded-md px-3 py-1 font-medium text-sm transition-colors",
                chartType === option
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              )}
              key={option}
              onClick={() => setChartType(option)}
              type="button"
            >
              {option.charAt(0).toUpperCase() + option.slice(1)}
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        {chartType === "bar" ? (
          <BreakdownBarChartContent data={data} onItemClick={onItemClick} />
        ) : (
          <BreakdownPieChartContent data={data} onItemClick={onItemClick} />
        )}
      </CardContent>
    </Card>
  );
}

// Internal chart content components without Card wrapper
function BreakdownBarChartContent({
  data,
  onItemClick,
}: {
  data: BreakdownDataPoint[];
  onItemClick?: (item: BreakdownDataPoint) => void;
}) {
  const sortedData = [...data].sort(
    (a, b) => b.totalProfitLoss - a.totalProfitLoss
  );

  const values = sortedData.map((d) => d.totalProfitLoss);
  const minValue = Math.min(...values, 0);
  const maxValue = Math.max(...values, 0);
  const padding = Math.abs(maxValue - minValue) * 0.1 || 100;
  const yMin = Math.floor(minValue - padding);
  const yMax = Math.ceil(maxValue + padding);

  return (
    <div className="h-48 w-full">
      <ResponsiveContainer height="100%" width="100%">
        <BarChart
          data={sortedData}
          margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
        >
          <CartesianGrid className="stroke-muted" strokeDasharray="3 3" />
          <XAxis
            angle={-45}
            axisLine={false}
            className="text-muted-foreground"
            dataKey="name"
            height={60}
            interval={0}
            textAnchor="end"
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
          <Tooltip content={<CustomBarTooltip />} />
          <Bar
            cursor={onItemClick ? "pointer" : "default"}
            dataKey="totalProfitLoss"
            onClick={(_data) => {
              const payload = (
                _data as unknown as { payload?: BreakdownDataPoint }
              ).payload;
              if (payload && onItemClick) {
                onItemClick(payload);
              }
            }}
            radius={[4, 4, 0, 0]}
          >
            {sortedData.map((entry, index) => (
              <Cell
                fill={getBarColor(entry.totalProfitLoss, index)}
                key={`cell-${entry.name}`}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function BreakdownPieChartContent({
  data,
  onItemClick,
}: {
  data: BreakdownDataPoint[];
  onItemClick?: (item: BreakdownDataPoint) => void;
}) {
  const sortedData = [...data].sort(
    (a, b) => Math.abs(b.totalProfitLoss) - Math.abs(a.totalProfitLoss)
  );

  const pieData = sortedData.map((item, index) => ({
    ...item,
    value: Math.abs(item.totalProfitLoss) || 0.01,
    fill:
      item.totalProfitLoss >= 0
        ? COLORS[index % COLORS.length]
        : NEGATIVE_COLORS[0],
  }));

  return (
    <>
      <div className="h-48 w-full">
        <ResponsiveContainer height="100%" width="100%">
          <PieChart>
            <Pie
              cursor={onItemClick ? "pointer" : "default"}
              cx="50%"
              cy="50%"
              data={pieData}
              dataKey="value"
              innerRadius={35}
              nameKey="name"
              onClick={(data) => {
                const item = data as unknown as BreakdownDataPoint;
                if (item && onItemClick) {
                  onItemClick(item);
                }
              }}
              outerRadius={70}
              paddingAngle={2}
            >
              {pieData.map((entry) => (
                <Cell fill={entry.fill} key={`cell-${entry.name}`} />
              ))}
            </Pie>
            <Tooltip content={<CustomPieTooltip />} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      {/* Legend */}
      <div className="mt-2 flex flex-wrap justify-center gap-2 text-xs">
        {pieData.slice(0, 6).map((entry) => (
          <div
            className="flex cursor-pointer items-center gap-1 hover:opacity-80"
            key={entry.name}
            onClick={() => onItemClick?.(entry)}
          >
            <div
              className="h-3 w-3 rounded-sm"
              style={{ backgroundColor: entry.fill }}
            />
            <span className="text-muted-foreground">{entry.name}</span>
          </div>
        ))}
        {pieData.length > 6 && (
          <span className="text-muted-foreground">
            +{pieData.length - 6} more
          </span>
        )}
      </div>
    </>
  );
}
