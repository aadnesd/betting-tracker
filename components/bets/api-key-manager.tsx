"use client";

import {
  AlertTriangle,
  Check,
  Copy,
  Key,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { toast } from "@/components/toast";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

interface ApiKeyManagerProps {
  hasKey: boolean;
  hint: string | null;
  createdAt: string | null;
}

/**
 * Client component for managing iOS Shortcut API keys.
 * Handles key generation, display (once), copy, and revocation.
 */
export function ApiKeyManager({ hasKey, hint, createdAt }: ApiKeyManagerProps) {
  const router = useRouter();
  const [isGenerating, setIsGenerating] = useState(false);
  const [isRevoking, setIsRevoking] = useState(false);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleGenerate = useCallback(async () => {
    setIsGenerating(true);
    try {
      const response = await fetch("/api/bets/settings/api-keys", {
        method: "POST",
      });

      if (!response.ok) {
        throw new Error("Failed to generate API key");
      }

      const data = await response.json();
      setNewKey(data.key);
      toast({
        type: "success",
        description: "API key generated - copy it now!",
      });
      router.refresh();
    } catch (error) {
      toast({
        type: "error",
        description:
          error instanceof Error ? error.message : "Failed to generate key",
      });
    } finally {
      setIsGenerating(false);
    }
  }, [router]);

  const handleRevoke = useCallback(async () => {
    if (
      !confirm(
        "Are you sure you want to revoke this API key? Any shortcuts using it will stop working."
      )
    ) {
      return;
    }

    setIsRevoking(true);
    try {
      const response = await fetch("/api/bets/settings/api-keys", {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("Failed to revoke API key");
      }

      setNewKey(null);
      toast({
        type: "success",
        description: "API key revoked",
      });
      router.refresh();
    } catch (error) {
      toast({
        type: "error",
        description:
          error instanceof Error ? error.message : "Failed to revoke key",
      });
    } finally {
      setIsRevoking(false);
    }
  }, [router]);

  const handleCopy = useCallback(async () => {
    if (!newKey) return;

    try {
      await navigator.clipboard.writeText(newKey);
      setCopied(true);
      toast({
        type: "success",
        description: "API key copied to clipboard",
      });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({
        type: "error",
        description: "Failed to copy - please copy manually",
      });
    }
  }, [newKey]);

  // Just generated a new key - show it with copy button
  if (newKey) {
    return (
      <div className="space-y-4">
        <Alert className="border-amber-500 bg-amber-50" variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle className="text-amber-900">Save this key now!</AlertTitle>
          <AlertDescription className="text-amber-800">
            This is the only time you'll see the full API key. Copy it and store
            it securely.
          </AlertDescription>
        </Alert>

        <div className="flex items-center gap-2">
          <div className="flex-1 break-all rounded-lg border bg-muted p-3 font-mono text-sm">
            {newKey}
          </div>
          <Button
            className="flex-shrink-0"
            onClick={handleCopy}
            size="icon"
            variant="outline"
          >
            {copied ? (
              <Check className="h-4 w-4 text-green-500" />
            ) : (
              <Copy className="h-4 w-4" />
            )}
          </Button>
        </div>

        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          <Key className="h-4 w-4" />
          <span>Created just now</span>
        </div>

        <Button
          className="w-full sm:w-auto"
          disabled={isRevoking}
          onClick={handleRevoke}
          variant="destructive"
        >
          {isRevoking ? (
            <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Trash2 className="mr-2 h-4 w-4" />
          )}
          Revoke Key
        </Button>
      </div>
    );
  }

  // Has existing key - show masked hint
  if (hasKey) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <div className="flex-1 rounded-lg border bg-muted p-3 font-mono text-sm">
            {"•".repeat(56)}
            {hint}
          </div>
        </div>

        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          <Key className="h-4 w-4" />
          <span>
            Created{" "}
            {createdAt
              ? new Date(createdAt).toLocaleDateString(undefined, {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })
              : "unknown"}
          </span>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            disabled={isRevoking}
            onClick={handleRevoke}
            variant="destructive"
          >
            {isRevoking ? (
              <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="mr-2 h-4 w-4" />
            )}
            Revoke Key
          </Button>
          <Button
            disabled={isGenerating}
            onClick={handleGenerate}
            variant="outline"
          >
            {isGenerating ? (
              <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Generate New Key
          </Button>
        </div>
      </div>
    );
  }

  // No key - show generate button
  return (
    <div className="space-y-4">
      <p className="text-muted-foreground">
        No API key has been generated yet. Generate one to start using iOS
        Shortcuts for bet intake.
      </p>

      <Button disabled={isGenerating} onClick={handleGenerate}>
        {isGenerating ? (
          <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <Key className="mr-2 h-4 w-4" />
        )}
        Generate API Key
      </Button>
    </div>
  );
}
