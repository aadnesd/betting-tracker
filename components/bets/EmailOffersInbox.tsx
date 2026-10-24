"use client";

import { ExternalLink, Loader2, Mail, RefreshCw } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import useSWR from "swr";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { EmailOfferView, Mailbox } from "@/lib/email-offers/types";
import { gmailMessageUrl } from "@/lib/email-offers/types";
import { EmailOfferAlerts } from "./EmailOfferAlerts";

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || "The request failed. Try again.");
  }
  return response.status === 204 ? (undefined as T) : response.json();
}

type InboxData = {
  offers: EmailOfferView[];
  scans: { mailboxEmail: string; checkedUntil: string | null; more: boolean }[];
};
const verdictLabels = {
  worth_checking: "Worth checking",
  review: "Review terms",
  skip: "Skip",
};

function OfferCard({
  offer,
  onStatus,
}: {
  offer: EmailOfferView;
  onStatus: (id: string, status: "saved" | "dismissed") => Promise<void>;
}) {
  const [pending, setPending] = useState(false);
  const a = offer.assessment;
  async function update(status: "saved" | "dismissed") {
    setPending(true);
    try {
      await onStatus(offer.id, status);
    } finally {
      setPending(false);
    }
  }
  return (
    <Card>
      <CardHeader className="space-y-3">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span
            className={`rounded-full px-2.5 py-1 font-medium ${a.verdict === "worth_checking" ? "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200" : "bg-muted text-muted-foreground"}`}
          >
            {verdictLabels[a.verdict]}
          </span>
          {offer.status === "saved" && (
            <span className="text-muted-foreground">Saved for review</span>
          )}
          <span className="text-muted-foreground">
            {a.bookmaker || "Bookmaker unconfirmed"}
          </span>
        </div>
        <CardTitle className="break-words text-xl">{a.title}</CardTitle>
        <CardDescription className="break-words">
          {offer.subject}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
          {a.rewardAmount !== null && a.currency && (
            <span>
              Advertised reward:{" "}
              <strong>
                {a.currency} {a.rewardAmount.toFixed(2)}
              </strong>
            </span>
          )}
          {a.qualifyingStake !== null && (
            <span>
              Qualifying stake: {a.currency || "Currency unknown"}{" "}
              {a.qualifyingStake}
            </span>
          )}
          {a.minOdds !== null && <span>Minimum odds: {a.minOdds}</span>}
          {a.wageringMultiplier !== null && (
            <span>Wagering: {a.wageringMultiplier}×</span>
          )}
          <span>
            Expiry:{" "}
            {a.expiresAt
              ? new Date(a.expiresAt).toLocaleString("en-GB", {
                  timeZone: "Europe/Oslo",
                })
              : "Not confirmed"}
          </span>
        </div>
        <p className="text-sm">{a.reasoning}</p>
        {a.terms.length > 0 && (
          <div>
            <p className="mb-2 font-medium text-sm">Terms found in the email</p>
            <ul className="list-disc space-y-1 pl-5 text-muted-foreground text-sm">
              {a.terms.map((term) => (
                <li key={term}>{term}</li>
              ))}
            </ul>
          </div>
        )}
        {a.unknowns.length > 0 && (
          <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-amber-950 dark:bg-amber-950 dark:text-amber-100">
            <p className="mb-2 font-medium text-sm">
              Check before using this offer
            </p>
            <ul className="list-disc space-y-1 pl-5 text-sm">
              {a.unknowns.map((unknown) => (
                <li key={unknown}>{unknown}</li>
              ))}
            </ul>
          </div>
        )}
        <details className="text-muted-foreground text-sm">
          <summary className="cursor-pointer">Email source</summary>
          <p className="mt-2 break-words">
            From {offer.sender}, received{" "}
            {new Date(offer.receivedAt).toLocaleDateString("en-GB")}, in{" "}
            {offer.mailboxEmail}.
          </p>
        </details>
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild size="sm" variant="outline">
            <a
              href={gmailMessageUrl(offer.mailboxEmail, offer.threadId)}
              rel="noopener noreferrer"
              target="_blank"
            >
              <ExternalLink className="mr-2 size-4" />
              Read in Gmail
            </a>
          </Button>
          {offer.status !== "saved" && (
            <Button
              disabled={pending}
              onClick={() => update("saved")}
              size="sm"
              variant="secondary"
            >
              Save for review
            </Button>
          )}
          <Button
            disabled={pending}
            onClick={() => update("dismissed")}
            size="sm"
            variant="ghost"
          >
            Dismiss
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function EmailOffersInbox() {
  const mailbox = useSWR<{ configured: boolean; connections: Mailbox[] }>(
    "/api/bets/mailbox",
    requestJson
  );
  const inbox = useSWR<InboxData>("/api/bets/email-offers", requestJson);
  const [connecting, setConnecting] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [filter, setFilter] = useState("all");
  const [scanMessage, setScanMessage] = useState("");
  const [disconnecting, setDisconnecting] = useState<string | null>(null);

  async function connect(id?: string) {
    setConnecting(true);
    try {
      const [{ default: Nango }, session] = await Promise.all([
        import("@nangohq/frontend"),
        requestJson<{ sessionToken: string }>(
          id
            ? `/api/bets/mailbox/${encodeURIComponent(id)}/reconnect`
            : "/api/bets/mailbox",
          { method: "POST" }
        ),
      ]);
      const ui = new Nango().openConnectUI({
        sessionToken: session.sessionToken,
        onEvent: async (event) => {
          if (event.type === "connect") {
            ui.close();
            setConnecting(false);
            await mailbox.mutate();
            toast.success("Gmail connected. You can now scan for offers.");
          } else if (event.type === "close") {
            setConnecting(false);
          } else if (event.type === "error") {
            toast.error("Gmail authorization failed. Try connecting again.");
            setConnecting(false);
          }
        },
      });
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to connect Gmail."
      );
      setConnecting(false);
    }
  }

  async function disconnect(id: string) {
    setDisconnecting(id);
    try {
      await requestJson(`/api/bets/mailbox/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      await mailbox.mutate();
      toast.success(
        "Gmail disconnected. Previously found offers remain available."
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to disconnect."
      );
    } finally {
      setDisconnecting(null);
    }
  }

  async function scan() {
    setScanning(true);
    setScanMessage("");
    try {
      const result = await requestJson<{
        scanned: number;
        found: number;
        more: boolean;
        busy: boolean;
      }>("/api/bets/email-offers/scan", { method: "POST" });
      setScanMessage(
        result.busy
          ? "A scan is already running. Refresh in a moment."
          : `Checked ${result.scanned} emails and found ${result.found} offers.${result.more ? " More emails remain. Continue scanning to check the next page." : " This mailbox is up to date."}`
      );
      await Promise.all([inbox.mutate(), mailbox.mutate()]);
    } catch (error) {
      setScanMessage(
        error instanceof Error ? error.message : "Scan failed. Try again."
      );
      await mailbox.mutate();
    } finally {
      setScanning(false);
    }
  }

  async function onStatus(id: string, status: "saved" | "dismissed") {
    try {
      await requestJson(`/api/bets/email-offers/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      await inbox.mutate();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to update offer."
      );
    }
  }

  const connections = mailbox.data?.connections ?? [];
  const offers = inbox.data?.offers ?? [];
  const visible = offers.filter(
    (offer) =>
      filter === "all" ||
      (filter === "saved"
        ? offer.status === "saved"
        : offer.assessment.verdict === filter)
  );
  const more = inbox.data?.scans.some((state) => state.more);

  return (
    <div className="space-y-6">
      <EmailOfferAlerts />
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="size-5" />
            Find offers in Gmail
          </CardTitle>
          <CardDescription>
            Connect your mailbox to find bookmaker promotions. Scans read recent
            promotional emails and assess their terms.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {mailbox.isLoading && (
            <p role="status">Loading mailbox connections…</p>
          )}
          {mailbox.error && (
            <div role="alert">
              <p>{mailbox.error.message}</p>
              <Button
                onClick={() => mailbox.mutate()}
                size="sm"
                variant="outline"
              >
                Retry connection check
              </Button>
            </div>
          )}
          {mailbox.data?.configured === false && (
            <p className="text-muted-foreground text-sm">
              Email scanning is not configured yet. Set up the Nango Gmail
              integration to enable it.
            </p>
          )}
          {connections.map((connection) => (
            <div
              className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3"
              key={connection.id}
            >
              <div className="min-w-0">
                <p className="break-all font-medium">
                  {connection.email || "Gmail account"}
                </p>
                <p className="text-muted-foreground text-sm">
                  {connection.needsReconnect
                    ? "Reconnect to resume scanning"
                    : connection.unavailable
                      ? "Gmail is temporarily unavailable. Try again later."
                      : "Connected"}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {connection.needsReconnect && (
                  <Button
                    disabled={connecting}
                    onClick={() => connect(connection.id)}
                    size="sm"
                  >
                    Reconnect Gmail
                  </Button>
                )}
                <Button
                  disabled={disconnecting !== null}
                  onClick={() => disconnect(connection.id)}
                  size="sm"
                  variant="ghost"
                >
                  {disconnecting === connection.id
                    ? "Disconnecting…"
                    : "Disconnect"}
                </Button>
              </div>
            </div>
          ))}
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={!mailbox.data?.configured || connecting}
              onClick={() => connect()}
              variant={connections.length ? "outline" : "default"}
            >
              {connecting ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <Mail className="mr-2 size-4" />
              )}
              {connections.length ? "Connect another Gmail" : "Connect Gmail"}
            </Button>
            <Button
              disabled={
                scanning ||
                !connections.some((c) => c.email && !c.needsReconnect)
              }
              onClick={scan}
              variant="outline"
            >
              <RefreshCw
                className={`mr-2 size-4 ${scanning ? "animate-spin" : ""}`}
              />
              {scanning
                ? "Scanning…"
                : more
                  ? "Continue scanning"
                  : "Scan for offers"}
            </Button>
          </div>
          {scanMessage && (
            <p className="text-sm" role="status">
              {scanMessage}
            </p>
          )}
          <p className="text-muted-foreground text-xs">
            Nango manages Gmail authorization. Email bodies are sent to the AI
            model for assessment and are not saved in the tracker. Only detected
            offers and their email references are stored. Scanning never changes
            your mailbox or credits a bonus.
          </p>
        </CardContent>
      </Card>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold text-xl">Offers from your email</h2>
          <p className="text-muted-foreground text-sm">
            Check eligibility, live back and lay odds, commission, and the full
            terms before using an offer.
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm">
          Show
          <select
            className="rounded-md border bg-background p-2"
            onChange={(event) => setFilter(event.target.value)}
            value={filter}
          >
            <option value="all">All offers</option>
            <option value="worth_checking">Worth checking</option>
            <option value="review">Review terms</option>
            <option value="skip">Skip</option>
            <option value="saved">Saved for review</option>
          </select>
        </label>
      </div>
      {inbox.isLoading && <p role="status">Loading offers…</p>}
      {inbox.error && (
        <div role="alert">
          <p>{inbox.error.message}</p>
          <Button onClick={() => inbox.mutate()} size="sm" variant="outline">
            Retry loading offers
          </Button>
        </div>
      )}
      {!inbox.isLoading && !inbox.error && visible.length === 0 && (
        <div className="rounded-lg border border-dashed p-8 text-center">
          <Mail className="mx-auto mb-3 size-8 text-muted-foreground" />
          <p className="font-medium">No offers to show</p>
          <p className="mt-1 text-muted-foreground text-sm">
            Connect Gmail and run a scan, or change the filter.
          </p>
        </div>
      )}
      {visible.map((offer) => (
        <OfferCard key={offer.id} offer={offer} onStatus={onStatus} />
      ))}
    </div>
  );
}
