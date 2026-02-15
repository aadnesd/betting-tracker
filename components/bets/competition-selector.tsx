"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import type { AVAILABLE_COMPETITIONS } from "@/lib/db/schema";

type Competition = (typeof AVAILABLE_COMPETITIONS)[number];

interface CompetitionSelectorProps {
  available: Competition[];
  enabled: string[];
  defaults: string[];
}

export function CompetitionSelector({
  available,
  enabled: initialEnabled,
  defaults,
}: CompetitionSelectorProps) {
  const router = useRouter();
  const [enabled, setEnabled] = useState<Set<string>>(new Set(initialEnabled));
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  // Group competitions by country/region
  const grouped = available.reduce(
    (acc, comp) => {
      const group = comp.country;
      if (!acc[group]) {
        acc[group] = [];
      }
      acc[group].push(comp);
      return acc;
    },
    {} as Record<string, Competition[]>
  );

  // Sort groups: England, Europe, then alphabetically
  const sortedGroups = Object.keys(grouped).sort((a, b) => {
    if (a === "England") return -1;
    if (b === "England") return 1;
    if (a === "Europe") return -1;
    if (b === "Europe") return 1;
    return a.localeCompare(b);
  });

  const toggleCompetition = (code: string) => {
    setEnabled((prev) => {
      const next = new Set(prev);
      if (next.has(code)) {
        next.delete(code);
      } else {
        next.add(code);
      }
      return next;
    });
    setMessage(null);
  };

  const selectAll = () => {
    setEnabled(new Set(available.map((c) => c.code)));
    setMessage(null);
  };

  const selectNone = () => {
    setEnabled(new Set());
    setMessage(null);
  };

  const handleSave = async () => {
    if (enabled.size === 0) {
      setMessage({ type: "error", text: "Select at least one competition" });
      return;
    }

    setSaving(true);
    setMessage(null);

    try {
      const res = await fetch("/api/bets/settings/competitions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ competitions: Array.from(enabled) }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to save");
      }

      setMessage({ type: "success", text: "Competitions saved successfully!" });
      router.refresh();
    } catch (err) {
      setMessage({
        type: "error",
        text:
          err instanceof Error ? err.message : "Failed to save competitions",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    setResetting(true);
    setMessage(null);

    try {
      const res = await fetch("/api/bets/settings/competitions", {
        method: "POST",
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to reset");
      }

      setEnabled(new Set(defaults));
      setMessage({ type: "success", text: "Reset to default competitions!" });
      router.refresh();
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to reset",
      });
    } finally {
      setResetting(false);
    }
  };

  const hasChanges =
    enabled.size !== initialEnabled.length ||
    !initialEnabled.every((c) => enabled.has(c));

  return (
    <div className="space-y-6">
      {/* Actions */}
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={selectAll} size="sm" variant="outline">
          Select All
        </Button>
        <Button onClick={selectNone} size="sm" variant="outline">
          Select None
        </Button>
        <Button
          disabled={resetting}
          onClick={handleReset}
          size="sm"
          variant="ghost"
        >
          {resetting ? "Resetting..." : "Reset to Defaults"}
        </Button>
      </div>

      {/* Competition Groups */}
      <div className="space-y-6">
        {sortedGroups.map((group) => (
          <div key={group}>
            <h3 className="mb-3 font-medium text-muted-foreground">{group}</h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {grouped[group].map((comp) => {
                const isDefault = defaults.includes(comp.code);
                return (
                  <div
                    className="flex items-start gap-3 rounded-md border p-3"
                    key={comp.code}
                  >
                    <Checkbox
                      checked={enabled.has(comp.code)}
                      id={`comp-${comp.code}`}
                      onCheckedChange={() => toggleCompetition(comp.code)}
                    />
                    <div className="flex-1">
                      <Label
                        className="cursor-pointer font-medium"
                        htmlFor={`comp-${comp.code}`}
                      >
                        {comp.name}
                      </Label>
                      <div className="flex items-center gap-2 text-muted-foreground text-xs">
                        <span className="font-mono">{comp.code}</span>
                        {isDefault && (
                          <span className="rounded-full bg-blue-100 px-1.5 py-0.5 text-blue-700">
                            default
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Message */}
      {message && (
        <div
          className={`rounded-md p-3 ${
            message.type === "success"
              ? "border-green-200 bg-green-50 text-green-800"
              : "border-red-200 bg-red-50 text-red-800"
          }`}
        >
          {message.text}
        </div>
      )}

      {/* Save Button */}
      <div className="flex items-center gap-3 border-t pt-4">
        <Button disabled={saving || enabled.size === 0} onClick={handleSave}>
          {saving ? "Saving..." : "Save Changes"}
        </Button>
        {hasChanges && (
          <span className="text-muted-foreground text-sm">
            {enabled.size} competition{enabled.size !== 1 ? "s" : ""} selected
          </span>
        )}
      </div>
    </div>
  );
}
