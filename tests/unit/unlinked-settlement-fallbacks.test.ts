import { afterEach, describe, expect, it } from "vitest";
import {
  getFallbackModels,
  isTransientLookupError,
} from "@/lib/unlinked-settlement-search";

const ENV_KEY = "UNLINKED_SETTLEMENT_SEARCH_FALLBACK_MODELS";

describe("getFallbackModels", () => {
  afterEach(() => {
    delete process.env[ENV_KEY];
  });

  it("returns the default fallback chain when no env override is set", () => {
    delete process.env[ENV_KEY];

    expect(getFallbackModels("openai/gpt-5.4-mini")).toEqual([
      "openai/gpt-5.1-thinking",
      "openai/gpt-5.3-codex",
      "openai/gpt-5.1-codex",
    ]);
  });

  it("excludes the primary model from its own fallback list", () => {
    delete process.env[ENV_KEY];

    expect(getFallbackModels("openai/gpt-5.1-thinking")).toEqual([
      "openai/gpt-5.3-codex",
      "openai/gpt-5.1-codex",
    ]);
  });

  it("parses a comma-separated env override and trims entries", () => {
    process.env[ENV_KEY] = " openai/gpt-5.1-codex , anthropic/claude-opus-4.7 ";

    expect(getFallbackModels("openai/gpt-5.4-mini")).toEqual([
      "openai/gpt-5.1-codex",
      "anthropic/claude-opus-4.7",
    ]);
  });

  it("drops empty entries from the env override", () => {
    process.env[ENV_KEY] = "openai/gpt-5.1-codex,,";

    expect(getFallbackModels("openai/gpt-5.4-mini")).toEqual([
      "openai/gpt-5.1-codex",
    ]);
  });

  it("returns an empty list when the only configured fallback is the primary", () => {
    process.env[ENV_KEY] = "openai/gpt-5.4-mini";

    expect(getFallbackModels("openai/gpt-5.4-mini")).toEqual([]);
  });
});

describe("isTransientLookupError", () => {
  it("treats free-tier rate-limit messages as transient", () => {
    const error = new Error(
      "Free tier requests on this model are rate-limited. Upgrade to paid credits."
    );

    expect(isTransientLookupError(error)).toBe(true);
  });

  it("treats 429 status codes as transient", () => {
    expect(isTransientLookupError({ statusCode: 429 })).toBe(true);
    expect(isTransientLookupError({ status: 429 })).toBe(true);
  });

  it("treats 5xx status codes as transient", () => {
    expect(isTransientLookupError({ statusCode: 503 })).toBe(true);
    expect(isTransientLookupError({ statusCode: 500 })).toBe(true);
  });

  it("treats network/timeout errors as transient", () => {
    expect(isTransientLookupError(new Error("fetch failed"))).toBe(true);
    expect(isTransientLookupError(new Error("ETIMEDOUT"))).toBe(true);
    expect(isTransientLookupError(new Error("socket hang up"))).toBe(true);
  });

  it("treats non-429 4xx status codes as hard (non-transient) failures", () => {
    expect(isTransientLookupError({ statusCode: 400 })).toBe(false);
    expect(isTransientLookupError({ statusCode: 401 })).toBe(false);
    expect(isTransientLookupError({ statusCode: 403 })).toBe(false);
  });

  it("treats unrelated errors as non-transient", () => {
    expect(
      isTransientLookupError(new Error("Search response was malformed"))
    ).toBe(false);
    expect(isTransientLookupError(undefined)).toBe(false);
    expect(isTransientLookupError(null)).toBe(false);
  });
});
