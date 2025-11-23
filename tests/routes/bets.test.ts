import { expect, test } from "../fixtures";

test.describe("/api/bets", () => {
  test("can upload screenshots, auto-parse, and save matched bet (stubbed)", async ({
    adaContext,
  }) => {
    const upload = await adaContext.request.post("/api/bets/screenshots", {
      multipart: {
        back: {
          name: "back.png",
          mimeType: "image/png",
          buffer: Buffer.from("stub-back"),
        },
        lay: {
          name: "lay.png",
          mimeType: "image/png",
          buffer: Buffer.from("stub-lay"),
        },
      },
    });

    expect(upload.status()).toBe(200);
    const uploadJson = await upload.json();
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
    expect(created.matched.status).toBe(
      parsed.needsReview ? "needs_review" : "matched"
    );
  });
});
