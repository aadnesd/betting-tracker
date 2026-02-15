"use client";

import { AlertCircle, CheckCircle2, FileUp, Upload, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { CsvRowError } from "@/lib/csv";

type ImportType = "bets" | "balances";

interface ImportResult {
  success: boolean;
  imported: number;
  errors: CsvRowError[];
  totalRows: number;
}

export default function ImportPage() {
  const router = useRouter();
  const [importType, setImportType] = useState<ImportType>("bets");
  const [file, setFile] = useState<File | null>(null);
  const [csvContent, setCsvContent] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  const handleFileSelect = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const selectedFile = event.target.files?.[0];
      if (!selectedFile) return;

      // Validate file type
      if (
        !selectedFile.name.endsWith(".csv") &&
        selectedFile.type !== "text/csv"
      ) {
        toast.error("Please select a CSV file");
        return;
      }

      setFile(selectedFile);
      setResult(null);

      // Read file content
      const reader = new FileReader();
      reader.onload = (e) => {
        const content = e.target?.result as string;
        setCsvContent(content);
      };
      reader.readAsText(selectedFile);
    },
    []
  );

  const handleDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      const droppedFile = event.dataTransfer.files[0];
      if (droppedFile) {
        // Create a synthetic change event
        const input = document.createElement("input");
        input.type = "file";
        const dataTransfer = new DataTransfer();
        dataTransfer.items.add(droppedFile);
        input.files = dataTransfer.files;

        handleFileSelect({
          target: input,
        } as unknown as React.ChangeEvent<HTMLInputElement>);
      }
    },
    [handleFileSelect]
  );

  const handleDragOver = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
    },
    []
  );

  const handleImport = async () => {
    if (!csvContent) {
      toast.error("No file selected");
      return;
    }

    setIsLoading(true);
    setResult(null);

    try {
      const response = await fetch("/api/bets/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: importType,
          csv: csvContent,
        }),
      });

      const data: ImportResult = await response.json();
      setResult(data);

      if (data.success) {
        toast.success(`Successfully imported ${data.imported} rows`);
      } else if (data.imported > 0) {
        toast.warning(
          `Imported ${data.imported} of ${data.totalRows} rows with ${data.errors.length} errors`
        );
      } else {
        toast.error("Import failed");
      }
    } catch (error) {
      console.error("Import error:", error);
      toast.error("Failed to import file");
    } finally {
      setIsLoading(false);
    }
  };

  const clearFile = () => {
    setFile(null);
    setCsvContent("");
    setResult(null);
  };

  const csvPreviewLines = csvContent.split("\n").slice(0, 6);

  return (
    <div className="container mx-auto max-w-4xl px-4 py-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-bold text-2xl">Import Data</h1>
          <p className="text-muted-foreground">
            Import bets or balance transactions from CSV
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/bets">← Back to Dashboard</Link>
        </Button>
      </div>

      {/* Import Type Selection */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-lg">Import Type</CardTitle>
        </CardHeader>
        <CardContent>
          <Select
            onValueChange={(v) => setImportType(v as ImportType)}
            value={importType}
          >
            <SelectTrigger className="w-64">
              <SelectValue placeholder="Select import type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="bets">Bets (Back/Lay)</SelectItem>
              <SelectItem value="balances">
                Balances (Deposits/Withdrawals)
              </SelectItem>
            </SelectContent>
          </Select>

          <div className="mt-4 text-muted-foreground text-sm">
            {importType === "bets" ? (
              <div>
                <p className="mb-2 font-medium">Required columns for bets:</p>
                <code className="rounded bg-muted px-2 py-1 text-xs">
                  kind, market, selection, odds, stake, exchange, currency
                </code>
                <p className="mt-2">
                  Optional: <code className="bg-muted px-1">placedAt</code>,{" "}
                  <code className="bg-muted px-1">notes</code>
                </p>
              </div>
            ) : (
              <div>
                <p className="mb-2 font-medium">
                  Required columns for balances:
                </p>
                <code className="rounded bg-muted px-2 py-1 text-xs">
                  account, type, amount, currency, date
                </code>
                <p className="mt-2">
                  Optional: <code className="bg-muted px-1">notes</code>
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* File Upload */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-lg">Upload CSV File</CardTitle>
        </CardHeader>
        <CardContent>
          {file ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between rounded-lg bg-muted p-4">
                <div className="flex items-center gap-3">
                  <FileUp className="h-8 w-8 text-primary" />
                  <div>
                    <p className="font-medium">{file.name}</p>
                    <p className="text-muted-foreground text-sm">
                      {(file.size / 1024).toFixed(1)} KB
                    </p>
                  </div>
                </div>
                <Button onClick={clearFile} size="icon" variant="ghost">
                  <X className="h-4 w-4" />
                </Button>
              </div>

              {/* CSV Preview */}
              {csvPreviewLines.length > 0 && (
                <div>
                  <p className="mb-2 font-medium text-sm">Preview:</p>
                  <div className="overflow-x-auto rounded-lg bg-muted p-4">
                    <pre className="font-mono text-xs">
                      {csvPreviewLines.map((line, i) => (
                        <div
                          className={i === 0 ? "font-bold text-primary" : ""}
                          key={i}
                        >
                          {line}
                        </div>
                      ))}
                      {csvContent.split("\n").length > 6 && (
                        <div className="mt-2 text-muted-foreground">
                          ... and {csvContent.split("\n").length - 6} more rows
                        </div>
                      )}
                    </pre>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div
              className="cursor-pointer rounded-lg border-2 border-muted-foreground/25 border-dashed p-8 text-center transition-colors hover:border-muted-foreground/50"
              onDragOver={handleDragOver}
              onDrop={handleDrop}
            >
              <input
                accept=".csv,text/csv"
                className="hidden"
                id="csv-upload"
                onChange={handleFileSelect}
                type="file"
              />
              <label className="cursor-pointer" htmlFor="csv-upload">
                <FileUp className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
                <p className="mb-1 font-medium text-lg">
                  Drop your CSV file here or click to upload
                </p>
                <p className="text-muted-foreground text-sm">
                  Supports .csv files
                </p>
              </label>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Import Button */}
      {file && !result && (
        <div className="mb-6 flex justify-center">
          <Button
            className="gap-2"
            disabled={isLoading}
            onClick={handleImport}
            size="lg"
          >
            <Upload className="h-4 w-4" />
            {isLoading ? "Importing..." : "Import Data"}
          </Button>
        </div>
      )}

      {/* Results */}
      {result && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              {result.success ? (
                <>
                  <CheckCircle2 className="h-5 w-5 text-green-500" />
                  Import Successful
                </>
              ) : result.imported > 0 ? (
                <>
                  <AlertCircle className="h-5 w-5 text-yellow-500" />
                  Partial Import
                </>
              ) : (
                <>
                  <AlertCircle className="h-5 w-5 text-red-500" />
                  Import Failed
                </>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-4 text-center">
              <div className="rounded-lg bg-muted p-4">
                <p className="font-bold text-2xl">{result.totalRows}</p>
                <p className="text-muted-foreground text-sm">Total Rows</p>
              </div>
              <div className="rounded-lg bg-green-500/10 p-4">
                <p className="font-bold text-2xl text-green-600">
                  {result.imported}
                </p>
                <p className="text-muted-foreground text-sm">Imported</p>
              </div>
              <div className="rounded-lg bg-red-500/10 p-4">
                <p className="font-bold text-2xl text-red-600">
                  {result.errors.length}
                </p>
                <p className="text-muted-foreground text-sm">Errors</p>
              </div>
            </div>

            {result.errors.length > 0 && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Import Errors</AlertTitle>
                <AlertDescription>
                  <div className="mt-2 max-h-60 overflow-y-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b">
                          <th className="py-1 text-left">Row</th>
                          <th className="py-1 text-left">Field</th>
                          <th className="py-1 text-left">Error</th>
                        </tr>
                      </thead>
                      <tbody>
                        {result.errors.map((error, i) => (
                          <tr className="border-red-200/20 border-b" key={i}>
                            <td className="py-1">{error.row}</td>
                            <td className="py-1">{error.field}</td>
                            <td className="py-1">{error.message}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </AlertDescription>
              </Alert>
            )}

            <div className="flex justify-center gap-4 pt-4">
              <Button onClick={clearFile} variant="outline">
                Import Another File
              </Button>
              <Button asChild>
                <Link href="/bets">Go to Dashboard</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
