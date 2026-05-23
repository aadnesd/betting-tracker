import "server-only";

import crypto from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;

function getEncryptionKey(): Buffer {
  const raw = process.env.GMAIL_TOKEN_ENCRYPTION_KEY;

  if (!raw) {
    throw new Error("GMAIL_TOKEN_ENCRYPTION_KEY is required");
  }

  const key =
    raw.length === 64 ? Buffer.from(raw, "hex") : Buffer.from(raw, "base64");

  if (key.length !== 32) {
    throw new Error("GMAIL_TOKEN_ENCRYPTION_KEY must decode to a 32-byte key");
  }

  return key;
}

export function encryptToken(token: string): string {
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, getEncryptionKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(token, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return [iv, tag, ciphertext]
    .map((part) => part.toString("base64url"))
    .join(".");
}

export function decryptToken(payload: string): string {
  const [ivValue, tagValue, ciphertextValue] = payload.split(".");

  if (!(ivValue && tagValue && ciphertextValue)) {
    throw new Error("Invalid encrypted token payload");
  }

  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    getEncryptionKey(),
    Buffer.from(ivValue, "base64url")
  );
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));

  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextValue, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}
