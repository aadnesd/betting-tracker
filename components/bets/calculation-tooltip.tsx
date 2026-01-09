"use client";

import { HelpCircle } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export type CalculationType =
  | "layLiability"
  | "netExposure"
  | "qualifyingLoss"
  | "commission"
  | "roi"
  | "fxConversion";

const CALCULATION_EXPLANATIONS: Record<
  CalculationType,
  { title: string; formula: string; description: string }
> = {
  layLiability: {
    title: "Lay Liability",
    formula: "Lay Stake × (Lay Odds − 1)",
    description:
      "The maximum amount you could lose on the lay bet if the selection wins. This is the amount locked in your exchange account.",
  },
  netExposure: {
    title: "Net Exposure",
    formula: "Lay Liability − Back Profit Potential",
    description:
      "Your net risk exposure after accounting for both the back and lay positions. Displayed in NOK as the base currency.",
  },
  qualifyingLoss: {
    title: "Qualifying Loss",
    formula: "Back Stake × (1 − Retention Rate)",
    description:
      "The expected loss on a qualifying bet due to the margin between back and lay odds. This is the 'cost' of unlocking free bets.",
  },
  commission: {
    title: "Exchange Commission",
    formula: "Net Winnings × Commission Rate",
    description:
      "Commission charged by the exchange on winning lay bets. Typically 2-5% depending on the exchange.",
  },
  roi: {
    title: "Return on Investment",
    formula: "(Total Profit ÷ Total Stake) × 100",
    description:
      "Percentage return on your total stakes. Positive ROI indicates profitable betting.",
  },
  fxConversion: {
    title: "Currency Conversion",
    formula: "Amount × Exchange Rate → NOK",
    description:
      "All amounts are converted to Norwegian Krone (NOK) as the base currency for consistent reporting and exposure tracking.",
  },
};

interface CalculationTooltipProps {
  type: CalculationType;
  className?: string;
  side?: "top" | "right" | "bottom" | "left";
}

export function CalculationTooltip({
  type,
  className,
  side = "top",
}: CalculationTooltipProps) {
  const explanation = CALCULATION_EXPLANATIONS[type];

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className={`inline-flex items-center text-muted-foreground hover:text-foreground transition-colors ${className}`}
            aria-label={`Learn about ${explanation.title}`}
          >
            <HelpCircle className="h-3.5 w-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent side={side} className="max-w-xs">
          <div className="space-y-1">
            <p className="font-medium">{explanation.title}</p>
            <p className="font-mono text-xs text-muted-foreground">
              {explanation.formula}
            </p>
            <p className="text-xs">{explanation.description}</p>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

interface ValueWithTooltipProps {
  type: CalculationType;
  children: React.ReactNode;
  className?: string;
  side?: "top" | "right" | "bottom" | "left";
}

/**
 * A wrapper that displays a value with an inline calculation tooltip.
 */
export function ValueWithTooltip({
  type,
  children,
  className,
  side = "top",
}: ValueWithTooltipProps) {
  return (
    <span className={`inline-flex items-center gap-1 ${className}`}>
      {children}
      <CalculationTooltip type={type} side={side} />
    </span>
  );
}
