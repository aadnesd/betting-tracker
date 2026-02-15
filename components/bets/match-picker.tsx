"use client";

import { CalendarDays, Loader2, Trophy, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export interface MatchOption {
  id: string;
  externalId: string;
  homeTeam: string;
  awayTeam: string;
  competition: string;
  competitionCode: string | null;
  matchDate: string;
  status: string;
  label: string;
  detail: string;
}

interface MatchPickerProps {
  value: string | null;
  onChange: (match: MatchOption | null) => void;
  disabled?: boolean;
  placeholder?: string;
}

/**
 * MatchPicker - Searchable dropdown for selecting a football match.
 *
 * Why: Enables linking matched bets to specific football matches for auto-settlement.
 * Fetches matches from the synced FootballMatch table via /api/bets/matches.
 */
export function MatchPicker({
  value,
  onChange,
  disabled = false,
  placeholder = "Type to search for a match...",
}: MatchPickerProps) {
  const [search, setSearch] = useState("");
  const [matches, setMatches] = useState<MatchOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingSelected, setLoadingSelected] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [selectedMatch, setSelectedMatch] = useState<MatchOption | null>(null);

  // Fetch matches when search changes
  const fetchMatches = useCallback(async (searchTerm: string) => {
    if (!searchTerm.trim() || searchTerm.trim().length < 2) {
      setMatches([]);
      return;
    }

    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("search", searchTerm.trim());
      params.set("limit", "10");

      const response = await fetch(`/api/bets/matches?${params.toString()}`);
      if (!response.ok) {
        throw new Error("Failed to fetch matches");
      }

      const data = await response.json();
      setMatches(data.matches || []);
    } catch (error) {
      console.error("[MatchPicker] Error fetching matches:", error);
      setMatches([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchMatches(search);
    }, 300);

    return () => clearTimeout(timer);
  }, [search, fetchMatches]);

  // Load selected match from value on mount (if it exists in search results)
  useEffect(() => {
    if (value && matches.length > 0 && !selectedMatch) {
      const match = matches.find((m) => m.id === value);
      if (match) {
        setSelectedMatch(match);
      }
    }
  }, [value, matches, selectedMatch]);

  // Fetch match details when a value is provided but not present in search results
  useEffect(() => {
    if (!value) {
      if (selectedMatch) {
        setSelectedMatch(null);
      }
      return;
    }

    if (selectedMatch?.id === value) {
      return;
    }

    let active = true;
    const fetchMatchById = async () => {
      setLoadingSelected(true);
      try {
        const response = await fetch(`/api/bets/matches/${value}`);
        if (!response.ok) {
          throw new Error("Failed to fetch selected match");
        }
        const data = await response.json();
        if (active && data.match) {
          setSelectedMatch(data.match);
        }
      } catch (error) {
        console.error("[MatchPicker] Error fetching selected match:", error);
      } finally {
        if (active) {
          setLoadingSelected(false);
        }
      }
    };

    fetchMatchById();
    return () => {
      active = false;
    };
  }, [value, selectedMatch]);

  const handleSelect = (match: MatchOption) => {
    setSelectedMatch(match);
    onChange(match);
    setShowResults(false);
    setSearch("");
  };

  const handleClear = () => {
    setSelectedMatch(null);
    onChange(null);
    setSearch("");
  };

  const formatMatchDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  // If a match is selected, show the selection
  if (selectedMatch) {
    return (
      <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm dark:border-blue-800 dark:bg-blue-950">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 font-medium text-blue-900 dark:text-blue-100">
            <Trophy className="h-4 w-4" />
            {selectedMatch.label}
          </div>
          <Button
            className="h-6 w-6 p-0 text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-200"
            disabled={disabled}
            onClick={handleClear}
            size="sm"
            type="button"
            variant="ghost"
          >
            <X className="h-4 w-4" />
            <span className="sr-only">Clear selection</span>
          </Button>
        </div>
        <div className="mt-1 flex items-center gap-2 text-blue-700 dark:text-blue-300">
          <span className="rounded bg-blue-100 px-1.5 py-0.5 text-xs dark:bg-blue-900">
            {selectedMatch.competitionCode || selectedMatch.competition}
          </span>
          <CalendarDays className="h-3 w-3" />
          <span>{formatMatchDate(selectedMatch.matchDate)}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="relative">
        <Trophy className="-translate-y-1/2 absolute top-1/2 left-3 h-4 w-4 text-muted-foreground" />
        <Input
          className="pl-9"
          disabled={disabled}
          onBlur={() => {
            // Delay hiding to allow click on results
            setTimeout(() => setShowResults(false), 200);
          }}
          onChange={(e) => {
            setSearch(e.target.value);
            setShowResults(true);
          }}
          onFocus={() => setShowResults(true)}
          placeholder={placeholder}
          value={search}
        />
        {(loading || loadingSelected) && (
          <Loader2 className="-translate-y-1/2 absolute top-1/2 right-3 h-4 w-4 animate-spin text-muted-foreground" />
        )}
      </div>

      {/* Search Results */}
      {showResults && search.trim().length >= 2 && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-lg">
          {loading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              <span className="ml-2 text-muted-foreground text-sm">
                Searching...
              </span>
            </div>
          ) : matches.length === 0 ? (
            <div className="py-4 text-center text-muted-foreground text-sm">
              No matches found for "{search}"
            </div>
          ) : (
            <ul className="max-h-60 overflow-auto py-1">
              {matches.map((match) => (
                <li key={match.id}>
                  <button
                    className="w-full px-3 py-2 text-left hover:bg-accent focus:bg-accent focus:outline-none"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      handleSelect(match);
                    }}
                    type="button"
                  >
                    <div className="flex items-center gap-2 font-medium">
                      <Trophy className="h-4 w-4 text-amber-500" />
                      {match.homeTeam} vs {match.awayTeam}
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-muted-foreground text-xs">
                      <span className="rounded bg-muted px-1.5 py-0.5">
                        {match.competitionCode || match.competition}
                      </span>
                      <CalendarDays className="h-3 w-3" />
                      {formatMatchDate(match.matchDate)}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
