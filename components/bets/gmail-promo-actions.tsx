"use client";

import { Loader2, Mail, RefreshCw, Unplug } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function GmailPromoActions({ connected }: { connected: boolean }) {
  const router = useRouter();
  const [isSyncing, setIsSyncing] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);

  const sync = async () => {
    setIsSyncing(true);
    try {
      const response = await fetch("/api/bets/gmail/sync", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ maxResults: 10 }),
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to sync Gmail");
      }

      toast.success(
        `Scanned ${payload.scanned} emails, found ${payload.created} new candidates`
      );
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to sync Gmail"
      );
    } finally {
      setIsSyncing(false);
    }
  };

  const disconnect = async () => {
    setIsDisconnecting(true);
    try {
      const response = await fetch("/api/bets/gmail/status", {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("Failed to disconnect Gmail");
      }

      toast.success("Gmail disconnected");
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to disconnect Gmail"
      );
    } finally {
      setIsDisconnecting(false);
    }
  };

  if (!connected) {
    return (
      <Button asChild>
        <a href="/api/bets/gmail/connect">
          <Mail className="mr-2 h-4 w-4" />
          Connect Gmail
        </a>
      </Button>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button disabled={isSyncing} onClick={sync}>
        {isSyncing ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <RefreshCw className="mr-2 h-4 w-4" />
        )}
        Sync Gmail
      </Button>
      <Button disabled={isDisconnecting} onClick={disconnect} variant="outline">
        {isDisconnecting ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <Unplug className="mr-2 h-4 w-4" />
        )}
        Disconnect
      </Button>
    </div>
  );
}
