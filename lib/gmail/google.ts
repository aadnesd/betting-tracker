import "server-only";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GMAIL_API_URL = "https://gmail.googleapis.com/gmail/v1/users/me";

export const GMAIL_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/gmail.readonly",
];

type GoogleTokenResponse = {
  access_token: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
  token_type: string;
};

export type GmailProfile = {
  emailAddress: string;
  messagesTotal?: number;
  threadsTotal?: number;
  historyId?: string;
};

export type GmailMessageListItem = {
  id: string;
  threadId?: string;
};

export type GmailMessage = {
  id: string;
  threadId?: string;
  labelIds?: string[];
  snippet?: string;
  internalDate?: string;
  payload?: GmailPayloadPart;
};

type GmailPayloadPart = {
  mimeType?: string;
  filename?: string;
  headers?: Array<{ name: string; value: string }>;
  body?: {
    data?: string;
  };
  parts?: GmailPayloadPart[];
};

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

export function getGmailRedirectUri(requestUrl: string): string {
  return (
    process.env.GMAIL_REDIRECT_URI ??
    new URL("/api/bets/gmail/callback", requestUrl).toString()
  );
}

export function createGmailAuthorizationUrl({
  state,
  requestUrl,
}: {
  state: string;
  requestUrl: string;
}) {
  const url = new URL(GOOGLE_AUTH_URL);
  url.searchParams.set("client_id", requireEnv("GOOGLE_CLIENT_ID"));
  url.searchParams.set("redirect_uri", getGmailRedirectUri(requestUrl));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", GMAIL_SCOPES.join(" "));
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("state", state);
  return url;
}

export async function exchangeGmailCodeForTokens({
  code,
  requestUrl,
}: {
  code: string;
  requestUrl: string;
}): Promise<GoogleTokenResponse> {
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: requireEnv("GOOGLE_CLIENT_ID"),
      client_secret: requireEnv("GOOGLE_CLIENT_SECRET"),
      redirect_uri: getGmailRedirectUri(requestUrl),
      grant_type: "authorization_code",
    }),
  });

  if (!response.ok) {
    throw new Error(`Google token exchange failed: ${response.status}`);
  }

  return response.json();
}

export async function refreshGmailAccessToken({
  refreshToken,
}: {
  refreshToken: string;
}): Promise<GoogleTokenResponse> {
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: requireEnv("GOOGLE_CLIENT_ID"),
      client_secret: requireEnv("GOOGLE_CLIENT_SECRET"),
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!response.ok) {
    throw new Error(`Google token refresh failed: ${response.status}`);
  }

  return response.json();
}

export async function fetchGmailProfile({
  accessToken,
}: {
  accessToken: string;
}): Promise<GmailProfile> {
  const response = await fetch(`${GMAIL_API_URL}/profile`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new Error(`Gmail profile fetch failed: ${response.status}`);
  }

  return response.json();
}

export async function searchGmailMessages({
  accessToken,
  query,
  maxResults,
}: {
  accessToken: string;
  query: string;
  maxResults: number;
}): Promise<GmailMessageListItem[]> {
  const url = new URL(`${GMAIL_API_URL}/messages`);
  url.searchParams.set("q", query);
  url.searchParams.set("maxResults", String(maxResults));

  const response = await fetch(url, {
    headers: { authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new Error(`Gmail message search failed: ${response.status}`);
  }

  const payload = (await response.json()) as {
    messages?: GmailMessageListItem[];
  };
  return payload.messages ?? [];
}

export async function readGmailMessage({
  accessToken,
  id,
}: {
  accessToken: string;
  id: string;
}): Promise<GmailMessage> {
  const url = new URL(`${GMAIL_API_URL}/messages/${id}`);
  url.searchParams.set("format", "full");

  const response = await fetch(url, {
    headers: { authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new Error(`Gmail message read failed: ${response.status}`);
  }

  return response.json();
}

export function getGmailHeader(message: GmailMessage, name: string) {
  const lowerName = name.toLowerCase();
  return (
    message.payload?.headers?.find(
      (header) => header.name.toLowerCase() === lowerName
    )?.value ?? null
  );
}

function decodeBase64Url(value: string): string {
  return Buffer.from(value, "base64url").toString("utf8");
}

export function extractGmailText(message: GmailMessage): string {
  const chunks: string[] = [];

  function visit(part?: GmailPayloadPart) {
    if (!part) {
      return;
    }

    if (
      (part.mimeType === "text/plain" || part.mimeType === "text/html") &&
      part.body?.data
    ) {
      chunks.push(decodeBase64Url(part.body.data));
    }

    for (const child of part.parts ?? []) {
      visit(child);
    }
  }

  visit(message.payload);

  return chunks
    .join("\n\n")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
