"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

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
          className={cn(
            currentPeriod === period.value && "pointer-events-none"
          )}
          key={period.value}
          onClick={() => handlePeriodChange(period.value)}
          size="sm"
          variant={currentPeriod === period.value ? "default" : "outline"}
        >
          {period.label}
        </Button>
      ))}
    </div>
  );
}
