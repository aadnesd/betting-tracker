/**
 * Azure Document Intelligence OCR Client
 *
 * Uses Azure's Document Intelligence (Form Recognizer) for fast, accurate OCR
 * of betting slip screenshots. This is significantly faster than using
 * vision LLMs for text extraction.
 *
 * The OCR extracts text, then we use a smaller/faster LLM to parse the
 * structured betting data from the extracted text.
 */

import {
  type AnalyzeResult,
  AzureKeyCredential,
  DocumentAnalysisClient,
} from "@azure/ai-form-recognizer";

let client: DocumentAnalysisClient | null = null;

function getClient(): DocumentAnalysisClient {
  const endpoint = process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT;
  const key = process.env.AZURE_DOCUMENT_INTELLIGENCE_KEY;

  if (!endpoint || !key) {
    throw new Error(
      "Azure Document Intelligence not configured. Set AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT and AZURE_DOCUMENT_INTELLIGENCE_KEY environment variables."
    );
  }

  if (!client) {
    client = new DocumentAnalysisClient(endpoint, new AzureKeyCredential(key));
  }

  return client;
}

export interface OcrResult {
  text: string;
  lines: string[];
  confidence: number;
  durationMs: number;
}

/**
 * Extract text from an image using Azure Document Intelligence OCR.
 *
 * @param imageData - Either a URL string or a Buffer/Uint8Array of image data
 * @returns Extracted text and metadata
 */
export async function extractTextFromImage(
  imageData: string | Buffer | Uint8Array
): Promise<OcrResult> {
  const startTime = Date.now();
  const client = getClient();

  let poller: Awaited<ReturnType<typeof client.beginAnalyzeDocument>>;

  if (typeof imageData === "string") {
    // It's a URL - could be a data URL or HTTP URL
    if (imageData.startsWith("data:")) {
      // Data URL - extract base64 and convert to buffer
      const base64Match = imageData.match(/^data:[^;]+;base64,(.+)$/);
      if (!base64Match) {
        throw new Error("Invalid data URL format");
      }
      const buffer = Buffer.from(base64Match[1], "base64");
      poller = await client.beginAnalyzeDocument("prebuilt-read", buffer);
    } else {
      // HTTP URL - fetch the image first
      const response = await fetch(imageData);
      if (!response.ok) {
        throw new Error(`Failed to fetch image: ${response.status}`);
      }
      const buffer = Buffer.from(await response.arrayBuffer());
      poller = await client.beginAnalyzeDocument("prebuilt-read", buffer);
    }
  } else {
    // It's already a buffer
    poller = await client.beginAnalyzeDocument("prebuilt-read", imageData);
  }

  const result =
    (await poller.pollUntilDone()) as AnalyzeResult<"prebuilt-read">;
  const durationMs = Date.now() - startTime;

  if (!result.content) {
    return {
      text: "",
      lines: [],
      confidence: 0,
      durationMs,
    };
  }

  // Extract lines and calculate average confidence
  const lines: string[] = [];
  let totalConfidence = 0;
  let confidenceCount = 0;

  const pages = result.pages;
  if (pages && Array.isArray(pages)) {
    for (const page of pages) {
      const pageLines = page.lines;
      if (pageLines && Array.isArray(pageLines)) {
        for (const line of pageLines) {
          lines.push(line.content);
          // Lines don't have confidence directly, but words do
          const words = line.words;
          if (words && Array.isArray(words)) {
            for (const word of words) {
              if (word.confidence !== undefined) {
                totalConfidence += word.confidence;
                confidenceCount++;
              }
            }
          }
        }
      }
    }
  }

  const avgConfidence =
    confidenceCount > 0 ? totalConfidence / confidenceCount : 1;

  return {
    text: result.content,
    lines,
    confidence: avgConfidence,
    durationMs,
  };
}

/**
 * Extract text from multiple images in parallel.
 */
export async function extractTextFromImages(
  images: (string | Buffer | Uint8Array)[]
): Promise<OcrResult[]> {
  return Promise.all(images.map(extractTextFromImage));
}
