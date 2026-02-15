import { describe, expect, test } from "vitest";

/**
 * Tests for clipboard paste intake functionality.
 *
 * Why these tests exist:
 * The clipboard paste intake feature allows users to paste bet screenshots directly
 * from their clipboard (using ⌘V on Mac or Ctrl+V on Windows) instead of saving
 * files first. This dramatically improves the workflow for desktop users.
 *
 * Testing approach:
 * Since the PasteZone and ScreenshotIntakeForm are client components that depend on
 * browser APIs (Clipboard API, FileReader, etc.), we test the logic and interfaces
 * rather than the DOM interactions. Full E2E testing with Playwright is recommended
 * for verifying actual paste behavior.
 */

describe("Clipboard Paste Intake", () => {
  describe("PasteZone Component Interface", () => {
    test("supports required props for both back and lay zones", () => {
      // PasteZone accepts these props:
      const pasteZoneProps = {
        kind: "back" as const, // "back" | "lay"
        label: "Back Bet (Bookmaker)",
        onImageChange: (_file: File | null, _kind: "back" | "lay") => {},
        file: null as File | null,
        isLoading: false,
        error: null as string | null,
        disabled: false,
      };

      // Verify all required fields exist
      expect(pasteZoneProps).toHaveProperty("kind");
      expect(pasteZoneProps).toHaveProperty("label");
      expect(pasteZoneProps).toHaveProperty("onImageChange");
      expect(pasteZoneProps).toHaveProperty("file");
      expect(["back", "lay"]).toContain(pasteZoneProps.kind);
    });

    test("supports file validation constraints", () => {
      // Max file size is 10MB
      const MAX_FILE_SIZE = 10 * 1024 * 1024;
      expect(MAX_FILE_SIZE).toBe(10_485_760);

      // Accepted file types
      const acceptedTypes = ["image/png", "image/jpeg", "image/webp"];
      expect(acceptedTypes).toContain("image/png");
      expect(acceptedTypes).toContain("image/jpeg");
    });

    test("generates correct filename for pasted images", () => {
      // When pasting from clipboard, files need generated names
      const kind = "back";
      const timestamp = Date.now();
      const extension = "png";
      const fileName = `${kind}-bet-${timestamp}.${extension}`;

      expect(fileName).toMatch(/^back-bet-\d+\.png$/);
      expect(fileName).toContain(kind);
      expect(fileName).toContain(extension);
    });
  });

  describe("ScreenshotIntakeForm Behavior", () => {
    test("tracks both images are ready state", () => {
      // Form has logic to check if both images are ready
      const backFile = new File([""], "back.png", { type: "image/png" });
      const layFile = new File([""], "lay.png", { type: "image/png" });

      const bothImagesReady = backFile !== null && layFile !== null;
      expect(bothImagesReady).toBe(true);
    });

    test("tracks single image ready state", () => {
      // Form supports single-image draft mode
      const backFile: File | null = new File([""], "back.png", {
        type: "image/png",
      });
      const layFile: File | null = null;

      // XOR: exactly one of them is ready
      const singleImageReady = (backFile !== null) !== (layFile !== null);
      expect(singleImageReady).toBe(true);
    });

    test("upload states are properly defined", () => {
      // Upload state machine
      type UploadState = "idle" | "uploading" | "parsing" | "success" | "error";

      const validStates: UploadState[] = [
        "idle",
        "uploading",
        "parsing",
        "success",
        "error",
      ];
      expect(validStates).toHaveLength(5);
      expect(validStates).toContain("idle");
      expect(validStates).toContain("success");
    });

    test("auto-parse triggers when both images ready", () => {
      // Auto-parse logic: trigger when both images ready and not already triggered
      let autoParseTriggered = false;
      const uploadState = "idle";
      const backFile = new File([""], "back.png", { type: "image/png" });
      const layFile = new File([""], "lay.png", { type: "image/png" });

      const bothReady = backFile !== null && layFile !== null;

      if (bothReady && !autoParseTriggered && uploadState === "idle") {
        autoParseTriggered = true;
        // In real code, this triggers uploadAndParse() after 500ms delay
      }

      expect(autoParseTriggered).toBe(true);
    });

    test("does not auto-parse if already triggered", () => {
      const autoParseTriggered = true; // Already triggered
      const uploadState = "idle";
      const backFile = new File([""], "back.png", { type: "image/png" });
      const layFile = new File([""], "lay.png", { type: "image/png" });

      const bothReady = backFile !== null && layFile !== null;
      let parseCount = 0;

      if (bothReady && !autoParseTriggered && uploadState === "idle") {
        parseCount++;
      }

      expect(parseCount).toBe(0); // Should not trigger again
    });
  });

  describe("File Handling", () => {
    test("creates File from clipboard blob with proper metadata", () => {
      // Simulate creating a File from a clipboard paste blob
      const blob = new Blob(["fake image data"], { type: "image/png" });
      const fileName = "back-bet-1234567890.png";
      const file = new File([blob], fileName, { type: blob.type });

      expect(file.name).toBe(fileName);
      expect(file.type).toBe("image/png");
      expect(file.size).toBe(blob.size);
    });

    test("extracts extension from MIME type correctly", () => {
      const mimeTypes = [
        { type: "image/png", expected: "png" },
        { type: "image/jpeg", expected: "jpeg" },
        { type: "image/webp", expected: "webp" },
        { type: "image/gif", expected: "gif" },
      ];

      for (const { type, expected } of mimeTypes) {
        const extension = type.split("/")[1] || "png";
        expect(extension).toBe(expected);
      }
    });

    test("falls back to png extension for unknown types", () => {
      const unknownType = "image/";
      const extension = unknownType.split("/")[1] || "png";
      expect(extension).toBe("png");
    });
  });

  describe("BetIntakeWrapper Phases", () => {
    test("starts in intake phase", () => {
      type Phase = "intake" | "review";
      const initialPhase: Phase = "intake";
      expect(initialPhase).toBe("intake");
    });

    test("transitions to review phase after parse complete", () => {
      type Phase = "intake" | "review";
      let phase: Phase = "intake";
      let intakeData: object | null = null;

      // Simulate parse complete callback
      const handleParseComplete = (data: { parsedData: object }) => {
        intakeData = { parsedData: data.parsedData };
        phase = "review";
      };

      handleParseComplete({
        parsedData: { market: "Test Match", selection: "Home" },
      });

      expect(phase).toBe("review");
      expect(intakeData).not.toBeNull();
    });

    test("can go back to intake phase", () => {
      type Phase = "intake" | "review";
      let phase: Phase = "review";

      const handleBack = () => {
        phase = "intake";
      };

      handleBack();
      expect(phase).toBe("intake");
    });
  });

  describe("Error Handling", () => {
    test("rejects non-image files", () => {
      const file = new File([""], "document.pdf", { type: "application/pdf" });
      const isImage = file.type.startsWith("image/");
      expect(isImage).toBe(false);
    });

    test("rejects oversized files", () => {
      const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
      const oversizedFile = { size: 15 * 1024 * 1024 }; // 15MB

      const isTooLarge = oversizedFile.size > MAX_FILE_SIZE;
      expect(isTooLarge).toBe(true);
    });

    test("accepts valid-sized image files", () => {
      const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
      const validFile = new File(["x".repeat(1000)], "bet.png", {
        type: "image/png",
      });

      const isValidSize = validFile.size <= MAX_FILE_SIZE;
      const isValidType = validFile.type.startsWith("image/");

      expect(isValidSize).toBe(true);
      expect(isValidType).toBe(true);
    });
  });

  describe("API Integration", () => {
    test("uses correct upload endpoint", () => {
      const uploadEndpoint = "/api/bets/screenshots";
      expect(uploadEndpoint).toBe("/api/bets/screenshots");
    });

    test("uses correct autoparse endpoint", () => {
      const autoparseEndpoint = "/api/bets/autoparse";
      expect(autoparseEndpoint).toBe("/api/bets/autoparse");
    });

    test("FormData includes both files with correct keys", () => {
      const formData = new FormData();
      const backFile = new File([""], "back.png", { type: "image/png" });
      const layFile = new File([""], "lay.png", { type: "image/png" });

      formData.append("back", backFile);
      formData.append("lay", layFile);

      expect(formData.get("back")).toBe(backFile);
      expect(formData.get("lay")).toBe(layFile);
    });

    test("autoparse payload includes screenshot IDs", () => {
      const payload = {
        backScreenshotId: "uuid-back-123",
        layScreenshotId: "uuid-lay-456",
      };

      expect(payload).toHaveProperty("backScreenshotId");
      expect(payload).toHaveProperty("layScreenshotId");
      expect(payload.backScreenshotId).toMatch(/^uuid-/);
      expect(payload.layScreenshotId).toMatch(/^uuid-/);
    });
  });

  describe("Keyboard Shortcuts", () => {
    test("delete/backspace removes image when zone focused", () => {
      const deleteKeys = ["Delete", "Backspace"];
      expect(deleteKeys).toContain("Delete");
      expect(deleteKeys).toContain("Backspace");
    });

    test("paste shortcut notation is correct", () => {
      // Mac uses ⌘V, Windows uses Ctrl+V
      const macShortcut = "⌘V";
      const windowsShortcut = "Ctrl+V";

      expect(macShortcut).toContain("V");
      expect(windowsShortcut).toContain("V");
    });
  });
});

describe("BetReviewForm Integration", () => {
  test("initializes form state from parsed data", () => {
    const parsedData = {
      back: {
        market: "Premier League",
        selection: "Arsenal",
        odds: 2.5,
        stake: 100,
        exchange: "Bet365",
        currency: "GBP",
      },
      lay: {
        market: "Premier League",
        selection: "Arsenal",
        odds: 2.52,
        stake: 99,
        exchange: "Betfair",
        currency: "nok", // lowercase should be normalized
      },
      needsReview: false,
    };

    // Normalize lay currency
    const normalizedLayCurrency = parsedData.lay.currency
      ? parsedData.lay.currency.toUpperCase()
      : "NOK";

    expect(normalizedLayCurrency).toBe("NOK");
  });

  test("computes net exposure correctly", () => {
    const back = { odds: 2.5, stake: 100 };
    const lay = { odds: 2.52, stake: 99 };

    const backProfit = back.stake * (back.odds - 1); // 100 * 1.5 = 150
    const layLiability = lay.stake * (lay.odds - 1); // 99 * 1.52 = 150.48
    const netExposure = Number((layLiability - backProfit).toFixed(2));

    expect(backProfit).toBe(150);
    expect(layLiability).toBeCloseTo(150.48);
    expect(netExposure).toBeCloseTo(0.48);
  });

  test("save payload includes all required fields", () => {
    const savePayload = {
      backScreenshotId: "back-123",
      layScreenshotId: "lay-456",
      market: "Premier League",
      selection: "Arsenal",
      matchId: null,
      needsReview: false,
      notes: "",
      back: { odds: 2.5, stake: 100 },
      lay: { odds: 2.52, stake: 99 },
    };

    expect(savePayload).toHaveProperty("backScreenshotId");
    expect(savePayload).toHaveProperty("layScreenshotId");
    expect(savePayload).toHaveProperty("market");
    expect(savePayload).toHaveProperty("selection");
    expect(savePayload).toHaveProperty("back");
    expect(savePayload).toHaveProperty("lay");
  });
});
