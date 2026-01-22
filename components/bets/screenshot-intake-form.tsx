"use client";
import { Camera, FileWarning, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { PasteZone } from "@/components/bets/paste-zone";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type UploadState = "idle" | "uploading" | "parsing" | "success" | "error";

interface ScreenshotRecord {
  id: string;
  url: string;
  kind: "back" | "lay";
  filename?: string | null;
}

interface ParsedResult {
  backScreenshotId: string;
  layScreenshotId: string;
  back: {
    id: string;
    url: string;
  };
  lay: {
    id: string;
    url: string;
  };
}

interface ScreenshotIntakeFormProps {
  /** Called when parsing completes successfully - provides screenshot IDs for the review form */
  onParseComplete?: (data: {
    backScreenshotId: string;
    layScreenshotId: string;
    parsedData: unknown;
  }) => void;
}

export function ScreenshotIntakeForm({
  onParseComplete,
}: ScreenshotIntakeFormProps) {
  const router = useRouter();
  const [backFile, setBackFile] = useState<File | null>(null);
  const [layFile, setLayFile] = useState<File | null>(null);
  const [uploadState, setUploadState] = useState<UploadState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [autoParseTriggered, setAutoParseTriggered] = useState(false);
  const [screenshots, setScreenshots] = useState<{
    back?: ScreenshotRecord;
    lay?: ScreenshotRecord;
  }>({});
  // Use Record<string, unknown> instead of unknown to satisfy React's type system
  const [parsedData, setParsedData] = useState<Record<string, unknown> | null>(null);

  const bothImagesReady = backFile !== null && layFile !== null;
  const singleImageReady = (backFile !== null) !== (layFile !== null);
  const isProcessing = uploadState === "uploading" || uploadState === "parsing";

  // Handle image change from either paste zone
  const handleImageChange = useCallback(
    (file: File | null, kind: "back" | "lay") => {
      setError(null);
      if (kind === "back") {
        setBackFile(file);
      } else {
        setLayFile(file);
      }
      // Reset auto-parse flag when images change
      setAutoParseTriggered(false);
    },
    []
  );

  // Upload and parse both screenshots
  const uploadAndParse = useCallback(async () => {
    if (!backFile || !layFile) {
      return;
    }

    setUploadState("uploading");
    setError(null);

    try {
      // Step 1: Upload both screenshots
      const formData = new FormData();
      formData.append("back", backFile);
      formData.append("lay", layFile);

      const uploadResp = await fetch("/api/bets/screenshots", {
        method: "POST",
        body: formData,
      });

      if (!uploadResp.ok) {
        const errorData = await uploadResp.json().catch(() => ({}));
        throw new Error(errorData.error || "Upload failed");
      }

      const uploadJson: ParsedResult = await uploadResp.json();
      setScreenshots({
        back: { ...uploadJson.back, kind: "back" },
        lay: { ...uploadJson.lay, kind: "lay" },
      });

      // Step 2: Parse screenshots
      setUploadState("parsing");

      const parseResp = await fetch("/api/bets/autoparse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          backScreenshotId: uploadJson.back.id,
          layScreenshotId: uploadJson.lay.id,
        }),
      });

      if (!parseResp.ok) {
        const errorData = await parseResp.json().catch(() => ({}));
        throw new Error(errorData.error || "Parsing failed");
      }

      const parsed = await parseResp.json();
      setParsedData(parsed);
      setUploadState("success");

      toast.success("Screenshots parsed successfully!");

      // Call the callback if provided
      if (onParseComplete) {
        onParseComplete({
          backScreenshotId: uploadJson.back.id,
          layScreenshotId: uploadJson.lay.id,
          parsedData: parsed,
        });
      }
    } catch (err) {
      console.error("Upload/parse error:", err);
      setUploadState("error");
      setError(err instanceof Error ? err.message : "An error occurred");
      toast.error("Upload or parsing failed. Please try again.");
    }
  }, [backFile, layFile, onParseComplete]);

  // Create draft with single image
  const createDraft = useCallback(async () => {
    const singleFile = backFile || layFile;
    const kind = backFile ? "back" : "lay";

    if (!singleFile) {
      return;
    }

    setUploadState("uploading");
    setError(null);

    try {
      // Upload single screenshot
      const formData = new FormData();
      formData.append(kind, singleFile);

      const uploadResp = await fetch("/api/bets/screenshots", {
        method: "POST",
        body: formData,
      });

      if (!uploadResp.ok) {
        throw new Error("Upload failed");
      }

      const uploadJson = await uploadResp.json();
      const screenshotId = uploadJson[kind]?.id;

      if (!screenshotId) {
        throw new Error("No screenshot ID returned");
      }

      // Parse single screenshot
      setUploadState("parsing");

      const parseResp = await fetch("/api/bets/autoparse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          [`${kind}ScreenshotId`]: screenshotId,
        }),
      });

      if (!parseResp.ok) {
        throw new Error("Parsing failed");
      }

      const parsed = await parseResp.json();
      setParsedData(parsed);
      setUploadState("success");

      toast.success(`Draft ${kind} bet parsed. Add the other leg to complete the matched bet.`);

      // Navigate to review or handle via callback
      if (onParseComplete) {
        onParseComplete({
          backScreenshotId: kind === "back" ? screenshotId : "",
          layScreenshotId: kind === "lay" ? screenshotId : "",
          parsedData: parsed,
        });
      }
    } catch (err) {
      console.error("Draft creation error:", err);
      setUploadState("error");
      setError(err instanceof Error ? err.message : "An error occurred");
      toast.error("Failed to create draft. Please try again.");
    }
  }, [backFile, layFile, onParseComplete]);

  // Auto-parse when both images are ready
  useEffect(() => {
    if (bothImagesReady && !autoParseTriggered && uploadState === "idle") {
      setAutoParseTriggered(true);
      // Small delay to let the user see both previews before parsing starts
      const timeout = setTimeout(() => {
        uploadAndParse();
      }, 500);
      return () => clearTimeout(timeout);
    }
  }, [bothImagesReady, autoParseTriggered, uploadState, uploadAndParse]);

  // Reset to initial state
  const handleReset = useCallback(() => {
    setBackFile(null);
    setLayFile(null);
    setUploadState("idle");
    setError(null);
    setAutoParseTriggered(false);
    setScreenshots({});
    setParsedData(null);
  }, []);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Camera className="h-5 w-5" />
          Upload Screenshots
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Paste zones side by side on desktop, stacked on mobile */}
        <div className="grid gap-4 md:grid-cols-2">
          <PasteZone
            kind="back"
            label="Back Bet (Bookmaker)"
            file={backFile}
            onImageChange={handleImageChange}
            isLoading={isProcessing}
            disabled={isProcessing}
          />
          <PasteZone
            kind="lay"
            label="Lay Bet (Exchange)"
            file={layFile}
            onImageChange={handleImageChange}
            isLoading={isProcessing}
            disabled={isProcessing}
          />
        </div>

        {/* Status and actions */}
        <div className="space-y-3">
          {/* Auto-parse status indicator */}
          {isProcessing && (
            <div className="flex items-center justify-center gap-2 rounded-md border border-primary/20 bg-primary/5 p-4 text-primary">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span className="font-medium">
                {uploadState === "uploading"
                  ? "Uploading screenshots..."
                  : "Parsing bet slips with AI..."}
              </span>
            </div>
          )}

          {/* Success state */}
          {uploadState === "success" && parsedData && (
            <div className="rounded-md border border-emerald-200 bg-emerald-50 p-4 text-emerald-800">
              <p className="font-medium">✓ Screenshots parsed successfully!</p>
              <p className="mt-1 text-sm">
                Review and confirm the parsed data below.
              </p>
            </div>
          )}

          {/* Error state */}
          {error && (
            <div className="flex items-start gap-2 rounded-md border border-destructive/50 bg-destructive/5 p-4 text-destructive">
              <FileWarning className="mt-0.5 h-5 w-5 flex-shrink-0" />
              <div>
                <p className="font-medium">Processing failed</p>
                <p className="text-sm">{error}</p>
              </div>
            </div>
          )}

          {/* Manual actions */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Parse button for both images (if auto-parse didn't trigger or failed) */}
            {bothImagesReady && (uploadState === "idle" || uploadState === "error") && (
              <Button onClick={uploadAndParse} disabled={isProcessing}>
                Upload & Parse
              </Button>
            )}

            {/* Draft button for single image */}
            {singleImageReady && uploadState === "idle" && (
              <Button onClick={createDraft} variant="outline" disabled={isProcessing}>
                Parse as Draft
              </Button>
            )}

            {/* Reset button when there's content */}
            {(backFile || layFile || uploadState !== "idle") && (
              <Button
                onClick={handleReset}
                variant="ghost"
                disabled={isProcessing}
              >
                Clear & Start Over
              </Button>
            )}
          </div>

          {/* Hint text */}
          {!backFile && !layFile && uploadState === "idle" && (
            <p className="text-center text-muted-foreground text-sm">
              Take screenshots of your bet slips, then paste (⌘V) or drop them
              above. Parsing starts automatically when both are ready.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
