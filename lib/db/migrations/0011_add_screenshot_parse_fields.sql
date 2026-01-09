ALTER TABLE "ScreenshotUpload"
  ADD COLUMN IF NOT EXISTS "parsedOutput" jsonb;

ALTER TABLE "ScreenshotUpload"
  ADD COLUMN IF NOT EXISTS "confidence" jsonb;
