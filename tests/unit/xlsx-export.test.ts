/**
 * Unit tests for XLSX export functionality.
 *
 * Why: Validates that the XLSX export generates a real Excel file with correct
 * MIME type, valid ZIP/XLSX structure, and proper data formatting. This ensures
 * users receive native spreadsheets rather than misnamed CSV files, preventing
 * data loss and compatibility issues with spreadsheet software.
 */

import { describe, expect, test } from "vitest";
import { createXlsxBuffer } from "@/lib/xlsx";

describe("XLSX buffer generation", () => {
  test("creates a valid buffer with content", () => {
    const buffer = createXlsxBuffer({
      name: "Test Sheet",
      rows: [
        ["Header 1", "Header 2"],
        ["Value 1", "Value 2"],
      ],
    });

    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.length).toBeGreaterThan(0);
  });

  test("creates a valid ZIP structure (starts with PK signature)", () => {
    const buffer = createXlsxBuffer({
      name: "Test",
      rows: [["A", "B"]],
    });

    // ZIP files start with PK\x03\x04 (0x04034b50 in little endian)
    expect(buffer[0]).toBe(0x50); // P
    expect(buffer[1]).toBe(0x4b); // K
    expect(buffer[2]).toBe(0x03);
    expect(buffer[3]).toBe(0x04);
  });

  test("handles empty rows", () => {
    const buffer = createXlsxBuffer({
      name: "Empty Sheet",
      rows: [],
    });

    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.length).toBeGreaterThan(0);
  });

  test("handles numeric values", () => {
    const buffer = createXlsxBuffer({
      name: "Numbers",
      rows: [
        ["Amount", "Rate"],
        [100, 2.5],
        [50.75, 1.85],
      ],
    });

    expect(buffer).toBeInstanceOf(Buffer);
    // Check that the buffer contains the worksheet XML with numeric values
    const content = buffer.toString("utf8");
    expect(content).toContain("<v>100</v>");
    expect(content).toContain("<v>2.5</v>");
    expect(content).toContain("<v>50.75</v>");
  });

  test("handles null and undefined values", () => {
    const buffer = createXlsxBuffer({
      name: "Nulls",
      rows: [
        ["Col1", "Col2", "Col3"],
        [null, "value", undefined],
      ],
    });

    expect(buffer).toBeInstanceOf(Buffer);
    // Should not throw on null/undefined
  });

  test("handles special characters in strings", () => {
    const buffer = createXlsxBuffer({
      name: "Special Chars",
      rows: [
        ["Name", "Description"],
        ["Test & Data", 'With "quotes"'],
        ["<Tags>", "Normal"],
      ],
    });

    expect(buffer).toBeInstanceOf(Buffer);
    const content = buffer.toString("utf8");
    // XML entities should be escaped
    expect(content).toContain("&amp;");
    expect(content).toContain("&lt;");
    expect(content).toContain("&gt;");
    expect(content).toContain("&quot;");
  });

  test("handles long sheet names (truncates to 31 chars)", () => {
    const longName = "This is a very long sheet name that exceeds the limit";
    const buffer = createXlsxBuffer({
      name: longName,
      rows: [["A"]],
    });

    const content = buffer.toString("utf8");
    // Should be truncated and not contain the full name
    expect(content).not.toContain(longName);
    expect(content).toContain(longName.slice(0, 31));
  });

  test("handles special characters in sheet names", () => {
    const buffer = createXlsxBuffer({
      name: "Sheet [Test]: Data*",
      rows: [["A"]],
    });

    const content = buffer.toString("utf8");
    // The sheet name attribute in workbook.xml should have special chars replaced
    // Match the sheet element specifically
    const sheetNameMatch = content.match(/<sheet name="([^"]+)"/);
    expect(sheetNameMatch).not.toBeNull();
    const sheetName = sheetNameMatch![1];
    expect(sheetName).not.toContain("[");
    expect(sheetName).not.toContain("]");
    expect(sheetName).not.toContain(":");
    expect(sheetName).not.toContain("*");
    // Should be cleaned to something like "Sheet  Test   Data"
    expect(sheetName).toContain("Sheet");
    expect(sheetName).toContain("Test");
    expect(sheetName).toContain("Data");
  });

  test("contains required XLSX parts", () => {
    const buffer = createXlsxBuffer({
      name: "Test",
      rows: [["A", "B"]],
    });

    const content = buffer.toString("utf8");

    // Check for essential XLSX XML parts
    expect(content).toContain("[Content_Types].xml");
    expect(content).toContain("xl/workbook.xml");
    expect(content).toContain("xl/worksheets/sheet1.xml");
    expect(content).toContain("xl/styles.xml");
    expect(content).toContain("_rels/.rels");
  });

  test("generates correct column references for wide sheets", () => {
    // Test columns A through Z and beyond (AA, AB, etc.)
    const wideRow = Array.from({ length: 30 }, (_, i) => `Col${i + 1}`);
    const buffer = createXlsxBuffer({
      name: "Wide",
      rows: [wideRow],
    });

    const content = buffer.toString("utf8");

    // Check for column references
    expect(content).toContain('r="A1"');
    expect(content).toContain('r="Z1"');
    expect(content).toContain('r="AA1"');
    expect(content).toContain('r="AD1"'); // 30th column
  });
});

describe("XLSX export structure for matched bets", () => {
  test("matched bets export has correct column structure", () => {
    // Simulate the export structure used in the export route
    const headers = [
      "matchedSetId",
      "market",
      "selection",
      "promoType",
      "status",
      "backExchange",
      "backOdds",
      "backStake",
      "backCurrency",
      "backProfitLoss",
      "layExchange",
      "layOdds",
      "layStake",
      "layCurrency",
      "layProfitLoss",
      "netExposure",
      "netProfit",
      "settledAt",
    ];

    const dataRow = [
      "uuid-123",
      "Man United vs Chelsea",
      "Man United",
      "free_bet",
      "settled",
      "Bet365",
      2.5,
      100,
      "NOK",
      150,
      "Betfair",
      2.48,
      100.5,
      "NOK",
      -100.5,
      50,
      49.5,
      "2024-01-15T10:00:00Z",
    ];

    const buffer = createXlsxBuffer({
      name: "Matched Bets",
      rows: [headers, dataRow],
    });

    expect(buffer).toBeInstanceOf(Buffer);
    const content = buffer.toString("utf8");

    // Verify header strings are present
    expect(content).toContain("matchedSetId");
    expect(content).toContain("market");
    expect(content).toContain("backProfitLoss");
    expect(content).toContain("netProfit");

    // Verify data is present
    expect(content).toContain("uuid-123");
    expect(content).toContain("Man United vs Chelsea");
    expect(content).toContain("Man United");
    expect(content).toContain("Bet365");
  });

  test("numeric values are stored as numbers not strings", () => {
    const buffer = createXlsxBuffer({
      name: "Test",
      rows: [
        ["odds", "stake"],
        [2.5, 100],
      ],
    });

    const content = buffer.toString("utf8");

    // Numeric values should have type="n" attribute
    expect(content).toContain('t="n"');
    expect(content).toContain("<v>2.5</v>");
    expect(content).toContain("<v>100</v>");
  });

  test("string values use inline strings", () => {
    const buffer = createXlsxBuffer({
      name: "Test",
      rows: [["name"], ["Test Value"]],
    });

    const content = buffer.toString("utf8");

    // String values should have type="inlineStr" attribute
    expect(content).toContain('t="inlineStr"');
    expect(content).toContain("<t>Test Value</t>");
  });
});

describe("XLSX MIME type and content type", () => {
  test("content types XML includes correct XLSX types", () => {
    const buffer = createXlsxBuffer({
      name: "Test",
      rows: [["A"]],
    });

    const content = buffer.toString("utf8");

    // Official XLSX content types
    expect(content).toContain(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"
    );
    expect(content).toContain(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"
    );
    expect(content).toContain(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"
    );
  });
});
