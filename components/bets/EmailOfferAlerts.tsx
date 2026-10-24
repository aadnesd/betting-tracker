"use client";

import { useState } from "react";
import useSWR from "swr";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const endpoint = "/api/bets/email-offers/alerts";
type Settings = {
  configured: boolean;
  enabled: boolean;
  chatId: string | null;
  pending: boolean;
  lastDelivery: { sentAt: string | null; lastError: string | null } | null;
};
async function request<T>(body?: object): Promise<T> {
  const response = await fetch(
    endpoint,
    body
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      : undefined
  );
  const result = await response.json();
  if (!response.ok) {
    throw new Error(result.error || "Telegram request failed. Try again.");
  }
  return result;
}

export function EmailOfferAlerts() {
  const settings = useSWR<Settings>(endpoint, () => request<Settings>());
  const [chatId, setChatId] = useState("");
  const [code, setCode] = useState("");
  const [botUrl, setBotUrl] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  async function submit(body: object, success: string) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await settings.mutate(await request<Settings>(body), false);
      setMessage(success);
      setCode("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Telegram request failed.");
    } finally {
      setBusy(false);
    }
  }
  async function showBot() {
    setBusy(true);
    setError("");
    try {
      setBotUrl(
        (await request<{ botUrl: string }>({ action: "bot_info" })).botUrl
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load bot.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>Telegram offer alerts</CardTitle>
        <CardDescription>
          Get a message when a new offer is worth checking. Alerts include the
          reward, key terms and a Gmail link. Older imported emails stay in this
          inbox.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {settings.isLoading && <p role="status">Loading alert settings…</p>}
        {settings.error && (
          <div role="alert">
            <p>{settings.error.message}</p>
            <Button onClick={() => settings.mutate()} variant="outline">
              Retry alert settings
            </Button>
          </div>
        )}
        {settings.data?.configured === false && (
          <p className="text-muted-foreground text-sm">
            Telegram alerts are not configured yet.
          </p>
        )}
        {settings.data?.configured && (
          <>
            <p className="text-sm">
              {settings.data.chatId
                ? `Verified chat ${settings.data.chatId}. Alerts are ${settings.data.enabled ? "on" : "paused"}.`
                : "Verify your private Telegram chat to turn on alerts."}
            </p>
            {settings.data.chatId && (
              <Button
                disabled={busy}
                onClick={() =>
                  submit(
                    { action: "set_enabled", enabled: !settings.data!.enabled },
                    settings.data!.enabled
                      ? "Alerts paused."
                      : "Alerts enabled for new emails."
                  )
                }
                variant="outline"
              >
                {settings.data.enabled ? "Pause alerts" : "Enable alerts"}
              </Button>
            )}
            <details key={settings.data.chatId || "unverified"}>
              <summary className="cursor-pointer text-sm">
                {settings.data.chatId
                  ? "Change Telegram chat"
                  : "Set up Telegram alerts"}
              </summary>
              <div className="mt-3 space-y-3">
                <p className="text-muted-foreground text-sm">
                  Start the alert bot in Telegram first. Enter your numeric
                  private chat ID, then confirm the code sent there. You can use
                  the chat ID from your existing Telegram alerts.
                </p>
                {botUrl ? (
                  <a
                    className="text-sm underline"
                    href={botUrl}
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    Open alert bot in Telegram
                  </a>
                ) : (
                  <Button
                    disabled={busy}
                    onClick={showBot}
                    size="sm"
                    variant="outline"
                  >
                    Find alert bot
                  </Button>
                )}
                <div className="space-y-2">
                  <Label htmlFor="telegram-chat-id">Telegram chat ID</Label>
                  <Input
                    autoComplete="off"
                    id="telegram-chat-id"
                    inputMode="numeric"
                    onChange={(e) => setChatId(e.target.value)}
                    value={chatId}
                  />
                </div>
                <Button
                  disabled={busy || !/^[1-9][0-9]{4,19}$/.test(chatId)}
                  onClick={() =>
                    submit(
                      { action: "request_code", chatId },
                      "Verification code sent to Telegram."
                    )
                  }
                >
                  Send verification code
                </Button>
              </div>
            </details>
            {settings.data.pending && (
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="telegram-code">Verification code</Label>
                  <Input
                    autoComplete="one-time-code"
                    id="telegram-code"
                    inputMode="numeric"
                    maxLength={6}
                    onChange={(e) => setCode(e.target.value)}
                    value={code}
                  />
                </div>
                <Button
                  disabled={busy || !/^[0-9]{6}$/.test(code)}
                  onClick={() =>
                    submit(
                      { action: "verify", code },
                      "Telegram verified. Alerts are enabled for new emails."
                    )
                  }
                >
                  Verify and enable alerts
                </Button>
              </div>
            )}
            <p className="text-muted-foreground text-sm">
              New mail is checked every 5 minutes, with another delivery attempt
              on the next run. Only complete, high-confidence offers trigger
              alerts. Eligibility and live odds still need your review.
            </p>
            {settings.data.lastDelivery?.lastError && (
              <p role="alert">{settings.data.lastDelivery.lastError}</p>
            )}
          </>
        )}
        {message && <p role="status">{message}</p>}
        {error && <p role="alert">{error}</p>}
      </CardContent>
    </Card>
  );
}
