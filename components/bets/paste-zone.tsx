"use client";
import { ClipboardPaste, FileUp, Loader2, X } from "lucide-react";
import Image from "next/image";
import { useCallback, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type PasteZoneState = "empty" | "hovering" | "focused" | "preview" | "loading" | "error";

interface PasteZoneProps {
  /** Identifier for this zone (e.g., "back" or "lay") */
  kind: "back" | "lay";
  /** Label shown in the header */
  label: string;
  /** Called when an image is added (from paste, drop, or file select) */
  onImageChange: (file: File | null, kind: "back" | "lay") => void;
  /** Current image file for this zone */
  file: File | null;
  /** Whether the zone is in loading state (e.g., during upload) */
  isLoading?: boolean;
  /** Error message to display */
  error?: string | null;
  /** Whether this zone is disabled */
  disabled?: boolean;
}

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export function PasteZone({
  kind,
  label,
  onImageChange,
  file,
  isLoading = false,
  error = null,
  disabled = false,
}: PasteZoneProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Generate preview when file changes
  const generatePreview = useCallback((imageFile: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      setPreviewUrl(e.target?.result as string);
    };
    reader.readAsDataURL(imageFile);
  }, []);

  // Handle file validation and state update
  const handleFile = useCallback(
    (imageFile: File) => {
      setLocalError(null);

      // Validate file type
      if (!imageFile.type.startsWith("image/")) {
        setLocalError("Please paste or select an image file");
        return;
      }

      // Validate file size
      if (imageFile.size > MAX_FILE_SIZE) {
        setLocalError("Image too large. Maximum size is 10MB");
        return;
      }

      generatePreview(imageFile);
      onImageChange(imageFile, kind);
    },
    [generatePreview, kind, onImageChange]
  );

  // Handle paste event
  const handlePaste = useCallback(
    (event: React.ClipboardEvent) => {
      if (disabled || isLoading) return;

      const items = event.clipboardData?.items;
      if (!items) return;

      for (const item of Array.from(items)) {
        if (item.type.startsWith("image/")) {
          event.preventDefault();
          const blob = item.getAsFile();
          if (blob) {
            // Convert blob to File with a generated name
            const fileName = `${kind}-bet-${Date.now()}.${blob.type.split("/")[1] || "png"}`;
            const file = new File([blob], fileName, { type: blob.type });
            handleFile(file);
          }
          return;
        }
      }

      // Not an image paste - show error
      setLocalError("Please paste an image");
    },
    [disabled, handleFile, isLoading, kind]
  );

  // Handle drag events
  const handleDragOver = useCallback(
    (event: React.DragEvent) => {
      if (disabled || isLoading) return;
      event.preventDefault();
      event.stopPropagation();
      setIsDragOver(true);
    },
    [disabled, isLoading]
  );

  const handleDragLeave = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      event.stopPropagation();
      setIsDragOver(false);

      if (disabled || isLoading) return;

      const droppedFile = event.dataTransfer.files?.[0];
      if (droppedFile) {
        handleFile(droppedFile);
      }
    },
    [disabled, handleFile, isLoading]
  );

  // Handle file input change
  const handleFileInputChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const selectedFile = event.target.files?.[0];
      if (selectedFile) {
        handleFile(selectedFile);
      }
      // Reset input so the same file can be selected again
      event.target.value = "";
    },
    [handleFile]
  );

  // Handle remove image
  const handleRemove = useCallback(() => {
    setPreviewUrl(null);
    setLocalError(null);
    onImageChange(null, kind);
  }, [kind, onImageChange]);

  // Handle click to focus for paste
  const handleContainerClick = useCallback(() => {
    if (disabled || isLoading) return;
    containerRef.current?.focus();
  }, [disabled, isLoading]);

  // Handle keyboard for remove
  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (disabled || isLoading) return;

      if ((event.key === "Delete" || event.key === "Backspace") && file) {
        event.preventDefault();
        handleRemove();
      }
    },
    [disabled, file, handleRemove, isLoading]
  );

  const displayError = error || localError;
  const hasImage = file !== null && previewUrl !== null;

  const getState = (): PasteZoneState => {
    if (isLoading) return "loading";
    if (displayError) return "error";
    if (hasImage) return "preview";
    if (isDragOver) return "hovering";
    if (isFocused) return "focused";
    return "empty";
  };

  const state = getState();

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="font-medium text-sm">{label}</span>
        {hasImage && (
          <span className="flex items-center gap-1 text-emerald-600 text-xs">
            ✓ Image ready
          </span>
        )}
      </div>

      <div
        ref={containerRef}
        role="button"
        tabIndex={disabled ? -1 : 0}
        className={cn(
          "relative flex min-h-[200px] flex-col items-center justify-center rounded-lg border-2 border-dashed p-4 transition-all focus:outline-none",
          // Empty state
          state === "empty" &&
            "cursor-pointer border-muted-foreground/25 bg-muted/50 hover:border-muted-foreground/50",
          // Hovering (drag over)
          state === "hovering" &&
            "border-primary bg-primary/5",
          // Focused (ready for paste)
          state === "focused" &&
            "border-primary ring-2 ring-primary/20",
          // Preview state
          state === "preview" &&
            "border-emerald-300 bg-emerald-50/50",
          // Loading state
          state === "loading" &&
            "cursor-wait border-muted-foreground/25 bg-muted/30",
          // Error state
          state === "error" &&
            "border-destructive/50 bg-destructive/5",
          // Disabled
          disabled && "cursor-not-allowed opacity-50"
        )}
        onClick={handleContainerClick}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onPaste={handlePaste}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        onKeyDown={handleKeyDown}
        aria-label={`${label} paste zone. ${hasImage ? "Image ready" : "Click and paste or drag an image"}`}
      >
        {isLoading ? (
          // Loading state
          <div className="flex flex-col items-center gap-3 text-muted-foreground">
            <Loader2 className="h-8 w-8 animate-spin" />
            <span className="text-sm">Processing...</span>
          </div>
        ) : hasImage ? (
          // Preview state
          <div className="relative w-full">
            <Image
              src={previewUrl}
              alt={`${label} preview`}
              width={320}
              height={192}
              className="mx-auto max-h-[180px] w-auto rounded-md border object-contain"
            />
            <Button
              type="button"
              variant="destructive"
              size="sm"
              className="absolute right-0 top-0 h-7 w-7 p-0"
              onClick={(e) => {
                e.stopPropagation();
                handleRemove();
              }}
              aria-label={`Remove ${label} image`}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          // Empty state with paste/drop instructions
          <div className="flex flex-col items-center gap-4 text-center">
            <div className="flex items-center gap-2 text-muted-foreground">
              <ClipboardPaste className="h-6 w-6" />
              <span className="font-medium">Click and paste</span>
              <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-xs">
                ⌘V
              </kbd>
            </div>

            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <span className="text-muted-foreground/50">———</span>
              <span>or</span>
              <span className="text-muted-foreground/50">———</span>
            </div>

            <div className="flex flex-col items-center gap-2">
              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                <FileUp className="h-5 w-5" />
                <span>Drop file here</span>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={handleFileInputChange}
                className="hidden"
                disabled={disabled}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  fileInputRef.current?.click();
                }}
                disabled={disabled}
              >
                Browse files
              </Button>
            </div>
          </div>
        )}
      </div>

      {displayError && (
        <p className="text-destructive text-sm">{displayError}</p>
      )}
    </div>
  );
}
