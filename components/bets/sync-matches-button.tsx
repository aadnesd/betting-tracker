"use client";

import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";

type SyncResponse = {
  success: boolean;
  error?: string;
  results?: {
    upcoming: { synced: number };
    finished: { synced: number };
  };
};

export function SyncMatchesButton() {
  const router = useRouter();
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const handleSync = async () => {
    setSyncing(true);
    setMessage(null);

    try {
      const res = await fetch("/api/bets/matches/sync", { method: "POST" });
      const data: SyncResponse = await res.json();

      if (!(res.ok && data.success)) {
        throw new Error(data.error || "Sync failed");
      }

      const upcoming = data.results?.upcoming.synced ?? 0;
      const finished = data.results?.finished.synced ?? 0;
      setMessage({
        type: "success",
        text: `Synced ${upcoming} upcoming and ${finished} finished matches.`,
      });
      router.refresh();
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Sync failed",
      });
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <Button disabled={syncing} onClick={handleSync} variant="outline">
        <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
        {syncing ? "Syncing..." : "Sync now"}
      </Button>
      {message && (
        <span
          className={`text-xs ${
            message.type === "success" ? "text-green-600" : "text-red-600"
          }`}
        >
          {message.text}
        </span>
      )}
    </div>
  );
}
