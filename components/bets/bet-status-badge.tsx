import { cn } from "@/lib/utils";

type Props = {
  status: "draft" | "placed" | "matched" | "settled" | "needs_review" | "error";
  className?: string;
};

const colorMap: Record<Props["status"], string> = {
  draft: "bg-slate-100 text-slate-800 border-slate-200",
  placed: "bg-sky-100 text-sky-800 border-sky-200",
  matched: "bg-emerald-100 text-emerald-800 border-emerald-200",
  settled: "bg-indigo-100 text-indigo-800 border-indigo-200",
  needs_review: "bg-amber-100 text-amber-800 border-amber-200",
  error: "bg-rose-100 text-rose-800 border-rose-200",
};

export function BetStatusBadge({ status, className }: Props) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 font-medium text-xs",
        colorMap[status],
        className
      )}
    >
      {status.replace("_", " ")}
    </span>
  );
}
