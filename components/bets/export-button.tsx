"use client";

import { Download } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface ExportButtonProps {
  startDate?: Date | null;
  endDate?: Date | null;
}

/**
 * Export button that triggers CSV download of matched bets.
 * Uses the /api/bets/export endpoint with date range filters.
 */
export function ExportButton({ startDate, endDate }: ExportButtonProps) {
  const [isLoading, setIsLoading] = useState(false);

  const handleExport = async (format: "csv" | "xlsx") => {
    setIsLoading(true);

    try {
      const params = new URLSearchParams();
      params.set("format", format);
      if (startDate) {
        params.set("startDate", startDate.toISOString());
      }
      if (endDate) {
        params.set("endDate", endDate.toISOString());
      }

      const response = await fetch(`/api/bets/export?${params.toString()}`);

      if (!response.ok) {
        throw new Error("Export failed");
      }

      // Get the blob and trigger download
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;

      // Get filename from Content-Disposition header if available
      const contentDisposition = response.headers.get("Content-Disposition");
      let filename = `matched-bets-export.${format}`;
      if (contentDisposition) {
        const match = contentDisposition.match(/filename="(.+)"/);
        if (match) {
          filename = match[1];
        }
      }

      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      toast.success("Export downloaded successfully");
    } catch (error) {
      console.error("Export error:", error);
      toast.error("Failed to export data");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button disabled={isLoading} size="sm" variant="outline">
          <Download className="mr-2 h-4 w-4" />
          {isLoading ? "Exporting..." : "Export"}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => handleExport("csv")}>
          Download as CSV
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleExport("xlsx")}>
          Download as Excel (XLSX)
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
