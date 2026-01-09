"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const periods = [
  { value: "week", label: "Last 7 days" },
  { value: "month", label: "Last 30 days" },
  { value: "quarter", label: "Last 90 days" },
  { value: "year", label: "Last year" },
  { value: "all", label: "All time" },
] as const;

type Period = (typeof periods)[number]["value"];

export function ReportingDateFilter() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const currentPeriod = (searchParams.get("period") as Period) || "month";

  const handlePeriodChange = (period: Period) => {
    const params = new URLSearchParams(searchParams);
    if (period === "month") {
      params.delete("period");
    } else {
      params.set("period", period);
    }
    router.push(`${pathname}?${params.toString()}`);
  };

  return (
    <div className="flex flex-wrap gap-2">
      {periods.map((period) => (
        <Button
          key={period.value}
          variant={currentPeriod === period.value ? "default" : "outline"}
          size="sm"
          onClick={() => handlePeriodChange(period.value)}
          className={cn(
            currentPeriod === period.value && "pointer-events-none"
          )}
        >
          {period.label}
        </Button>
      ))}
    </div>
  );
}
