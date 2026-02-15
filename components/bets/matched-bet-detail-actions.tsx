"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { DeleteConfirmDialog } from "@/components/bets/delete-confirm-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

type MismatchIssue = {
  type: "missing_leg" | "odds_drift" | "currency_mismatch" | "market_mismatch";
  label: string;
};

type MatchedBetStatus = "draft" | "matched" | "settled" | "needs_review";

interface Props {
  matchedBetId: string;
  currentStatus: MatchedBetStatus;
  hasBothLegs: boolean;
  mismatches: MismatchIssue[];
  backBetId?: string | null;
}

export function MatchedBetDetailActions({
  matchedBetId,
  currentStatus,
  hasBothLegs,
  mismatches,
  backBetId,
}: Props) {
  const router = useRouter();
  const [status, setStatus] = useState<MatchedBetStatus>(currentStatus);
  const [notes, setNotes] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isRecalculating, setIsRecalculating] = useState(false);
  const [cascadeDelete, setCascadeDelete] = useState(false);

  const hasMismatches = mismatches.length > 0;

  const handleStatusChange = async (newStatus: MatchedBetStatus) => {
    setStatus(newStatus);
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const resp = await fetch("/api/bets/update-matched", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: matchedBetId,
          status,
          notes: notes || undefined,
        }),
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.error || "Failed to update");
      }

      toast.success("Matched bet updated");
      router.refresh();
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "Update failed");
    } finally {
      setIsSaving(false);
    }
  };

  const handleMarkResolved = async () => {
    setIsSaving(true);
    try {
      const resp = await fetch("/api/bets/update-matched", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: matchedBetId,
          status: "matched",
          notes: `Marked resolved. ${notes}`.trim(),
          lastError: null,
        }),
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.error || "Failed to resolve");
      }

      toast.success("Marked as resolved");
      router.refresh();
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "Resolve failed");
    } finally {
      setIsSaving(false);
    }
  };

  const handleConfirm = async () => {
    setIsSaving(true);
    try {
      const resp = await fetch("/api/bets/update-matched", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: matchedBetId,
          status: "matched",
          confirmedAt: new Date().toISOString(),
          notes: notes || undefined,
          lastError: null,
        }),
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.error || "Failed to confirm");
      }

      toast.success("Bet confirmed and matched!");
      router.refresh();
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "Confirm failed");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    const url = `/api/bets/${matchedBetId}${cascadeDelete ? "?cascade=true" : ""}`;
    const resp = await fetch(url, { method: "DELETE" });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.error || "Failed to delete");
    }

    toast.success(
      cascadeDelete
        ? "Matched bet and linked bets deleted"
        : "Matched bet deleted"
    );
    router.push("/bets");
  };

  const handleRecalculateExposure = async () => {
    setIsRecalculating(true);
    try {
      const resp = await fetch("/api/bets/recalculate-exposure", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: matchedBetId }),
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.error || "Failed to recalculate");
      }

      const result = await resp.json();
      toast.success(
        `Net exposure recalculated: ${result.oldNetExposure?.toFixed(2) ?? "N/A"} → ${result.newNetExposure?.toFixed(2)} NOK`
      );
      router.refresh();
    } catch (error) {
      console.error(error);
      toast.error(
        error instanceof Error ? error.message : "Recalculation failed"
      );
    } finally {
      setIsRecalculating(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Actions</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Status select */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <label className="min-w-24 font-medium text-sm">Status</label>
          <Select
            onValueChange={(v) => handleStatusChange(v as MatchedBetStatus)}
            value={status}
          >
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="matched">Matched</SelectItem>
              <SelectItem value="settled">Settled</SelectItem>
              <SelectItem value="needs_review">Needs review</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Notes input */}
        <div className="space-y-2">
          <label className="font-medium text-sm">Add note (optional)</label>
          <Textarea
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Add a note to accompany this action..."
            value={notes}
          />
        </div>

        {/* Action buttons */}
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={isSaving || status === currentStatus}
            onClick={handleSave}
            variant="outline"
          >
            {isSaving ? "Saving..." : "Save changes"}
          </Button>

          {/* Recalculate exposure - especially useful for currency mismatches */}
          {hasBothLegs && (
            <Button
              disabled={isRecalculating || isSaving}
              onClick={handleRecalculateExposure}
              variant="outline"
            >
              {isRecalculating ? "Recalculating..." : "Recalculate exposure"}
            </Button>
          )}

          {/* Quick resolve for needs_review */}
          {(currentStatus === "needs_review" || currentStatus === "draft") && (
            <>
              {hasBothLegs && !hasMismatches && (
                <Button
                  disabled={isSaving}
                  onClick={handleConfirm}
                  variant="default"
                >
                  ✓ Confirm & match
                </Button>
              )}
              <Button
                disabled={isSaving}
                onClick={handleMarkResolved}
                variant="secondary"
              >
                Mark resolved
              </Button>
            </>
          )}

          {/* Delete button with confirmation */}
          <DeleteConfirmDialog
            description="This action cannot be undone. The matched bet will be permanently deleted."
            destructiveLabel="Delete"
            disabled={isSaving}
            onCascadeChange={setCascadeDelete}
            onConfirm={handleDelete}
            showCascadeOption={hasBothLegs}
            title="Delete matched bet?"
          />
        </div>

        {/* Guidance based on mismatches */}
        {hasMismatches && (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm">
            <p className="font-medium text-amber-800">
              To confirm this bet, resolve the following issues:
            </p>
            <ul className="mt-1 list-inside list-disc text-amber-700">
              {mismatches.map((m, i) => (
                <li key={i}>{m.label}</li>
              ))}
            </ul>
            {mismatches.some((m) => m.type === "missing_leg") && (
              <p className="mt-2 text-amber-700">
                Use the attach leg action to complete this matched set.
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
