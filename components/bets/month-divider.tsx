/**
 * MonthDivider – A subtle horizontal line with a centered month/year label.
 *
 * Inserted between transaction rows to visually separate months.
 */
export function MonthDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 py-1">
      <div className="h-px flex-1 bg-border" />
      <span className="shrink-0 font-medium text-muted-foreground text-xs tracking-wide">
        {label}
      </span>
      <div className="h-px flex-1 bg-border" />
    </div>
  );
}

/**
 * Compute a display key like "April 2026" from an ISO date string.
 */
export function monthKey(isoDate: string): string {
  const d = new Date(isoDate);
  return d.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
}
