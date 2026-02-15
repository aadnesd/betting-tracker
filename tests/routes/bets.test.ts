import fs from "node:fs";
import path from "node:path";
import type { APIRequestContext } from "@playwright/test";
import { expect, test } from "../fixtures";

const imagePath = (name: string) =>
  path.join(__dirname, "..", "test-images", name);

const readImage = (name: string) => fs.readFileSync(imagePath(name));

async function uploadScreenshots({
  request,
  backName,
  layName,
}: {
  request: APIRequestContext;
  backName: string;
  layName: string;
}) {
  const upload = await request.post("/api/bets/screenshots", {
    multipart: {
      back: {
        name: backName,
        mimeType: "image/png",
        buffer: readImage(backName),
      },
      lay: {
        name: layName,
        mimeType: "image/png",
        buffer: readImage(layName),
      },
    },
  });

  expect(upload.status()).toBe(200);
  return upload.json();
}

async function createAccounts(request: APIRequestContext) {
  const bookmaker = await request.post("/api/bets/accounts", {
    data: {
      name: "Bet365",
      kind: "bookmaker",
      currency: "EUR",
    },
  });

  expect(bookmaker.status()).toBe(200);
  const bookmakerJson = await bookmaker.json();

  const exchange = await request.post("/api/bets/accounts", {
    data: {
      name: "bfb247",
      kind: "exchange",
      currency: "NOK",
    },
  });

  expect(exchange.status()).toBe(200);
  const exchangeJson = await exchange.json();

  return {
    bookmakerId: bookmakerJson.account.id as string,
    exchangeId: exchangeJson.account.id as string,
  };
}

test.describe("/api/bets", () => {
  test("can upload screenshots, auto-parse, and save matched bet (happy path)", async ({
    adaContext,
  }) => {
    const { bookmakerId, exchangeId } = await createAccounts(
      adaContext.request
    );

    const uploadJson = await uploadScreenshots({
      request: adaContext.request,
      backName: "bet2.png",
      layName: "bet2.png",
    });
    expect(uploadJson.back.kind).toBe("back");
    expect(uploadJson.lay.kind).toBe("lay");

    const parse = await adaContext.request.post("/api/bets/autoparse", {
      data: {
        backScreenshotId: uploadJson.back.id,
        layScreenshotId: uploadJson.lay.id,
      },
    });

    expect(parse.status()).toBe(200);
    const parsed = await parse.json();
    expect(parsed.back.selection).toContain("Arsenal");
    expect(parsed.lay.type).toBe("lay");
    expect(parsed.needsReview).toBe(false);
    expect(parsed.back.accountId).toBe(bookmakerId);
    expect(parsed.lay.accountId).toBe(exchangeId);
    expect(parsed.back.confidence?.market).toBeGreaterThan(0.8);
    expect(parsed.lay.confidence?.market).toBeGreaterThan(0.8);

    const create = await adaContext.request.post("/api/bets/create-matched", {
      data: {
        backScreenshotId: uploadJson.back.id,
        layScreenshotId: uploadJson.lay.id,
        market: parsed.back.market,
        selection: parsed.back.selection,
        needsReview: parsed.needsReview,
        notes: parsed.notes,
        back: parsed.back,
        lay: parsed.lay,
      },
    });

    expect(create.status()).toBe(200);
    const created = await create.json();
    expect(created.matched.status).toBe("matched");
  });

  test("flags unmatched accounts as needs review", async ({
    babbageContext,
  }) => {
    const uploadJson = await uploadScreenshots({
      request: babbageContext.request,
      backName: "bet3.png",
      layName: "bet3.png",
    });

    const parse = await babbageContext.request.post("/api/bets/autoparse", {
      data: {
        backScreenshotId: uploadJson.back.id,
        layScreenshotId: uploadJson.lay.id,
      },
    });

    expect(parse.status()).toBe(200);
    const parsed = await parse.json();
    expect(parsed.needsReview).toBe(true);
    expect(parsed.back.unmatchedAccount).toBe(true);
    expect(parsed.lay.unmatchedAccount).toBe(true);

    const create = await babbageContext.request.post(
      "/api/bets/create-matched",
      {
        data: {
          backScreenshotId: uploadJson.back.id,
          layScreenshotId: uploadJson.lay.id,
          market: parsed.back.market,
          selection: parsed.back.selection,
          needsReview: parsed.needsReview,
          notes: parsed.notes,
          back: parsed.back,
          lay: parsed.lay,
        },
      }
    );

    expect(create.status()).toBe(200);
    const created = await create.json();
    expect(created.matched.status).toBe("needs_review");
  });

  test("returns a needs-review response for non-betting images", async ({
    curieContext,
  }) => {
    const uploadJson = await uploadScreenshots({
      request: curieContext.request,
      backName: "cat.png",
      layName: "cat.png",
    });

    const parse = await curieContext.request.post("/api/bets/autoparse", {
      data: {
        backScreenshotId: uploadJson.back.id,
        layScreenshotId: uploadJson.lay.id,
      },
    });

    expect(parse.status()).toBe(200);
    const parsed = await parse.json();
    expect(parsed.needsReview).toBe(true);
    expect(parsed.notes).toContain("Test environment stub response");
  });
});
