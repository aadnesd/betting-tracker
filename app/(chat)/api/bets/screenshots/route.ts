import { Buffer } from "node:buffer";
import { put } from "@vercel/blob";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getTestAwareSession } from "@/lib/auth";
import { isTestEnvironment } from "@/lib/constants";
import { saveScreenshotUpload } from "@/lib/db/queries";

/**
 * Performance timer utility for diagnosing API slowness.
 * Records elapsed time for named phases.
 */
function createTimer() {
  const startTime = Date.now();
  const phases: Record<string, number> = {};
  let lastMark = startTime;

  return {
    mark(name: string) {
      const now = Date.now();
      phases[name] = now - lastMark;
      lastMark = now;
    },
    log(prefix: string) {
      const totalMs = Date.now() - startTime;
      const phaseStr = Object.entries(phases)
        .map(([name, ms]) => `${name}=${ms}ms`)
        .join(", ");
      console.log(`[${prefix}] Total: ${totalMs}ms | Phases: ${phaseStr}`);
    },
  };
}

const FileSchema = z.instanceof(Blob).refine((file) => {
  return (
    file.size <= 8 * 1024 * 1024 &&
    ["image/jpeg", "image/png"].includes(file.type)
  );
});

export async function POST(request: Request) {
  const timer = createTimer();
  const session = await getTestAwareSession();
  timer.mark("auth");

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    timer.mark("parseFormData");
    const back = formData.get("back");
    const lay = formData.get("lay");

    if (!(back instanceof File) || !(lay instanceof File)) {
      return NextResponse.json(
        { error: "Both back and lay screenshots are required" },
        { status: 400 }
      );
    }

    const backValidation = FileSchema.safeParse(back);
    const layValidation = FileSchema.safeParse(lay);

    if (!backValidation.success || !layValidation.success) {
      return NextResponse.json(
        { error: "Images must be PNG or JPEG and <= 8MB" },
        { status: 400 }
      );
    }

    const toUrl = async (file: File) => {
      const arrayBuffer = await file.arrayBuffer();

      if (isTestEnvironment) {
        const base64 = Buffer.from(arrayBuffer).toString("base64");
        const encodedName = encodeURIComponent(file.name);
        return {
          url: `data:${file.type};name=${encodedName};base64,${base64}`,
          file,
        };
      }

      const key = `${session.user.id}/${Date.now()}-${file.name}`;
      const result = await put(key, arrayBuffer, {
        access: "public",
        contentType: file.type,
      });
      return { url: result.url, file };
    };

    const [backUrl, layUrl] = await Promise.all([toUrl(back), toUrl(lay)]);
    timer.mark("blobUpload");

    const [backRow, layRow] = await Promise.all([
      saveScreenshotUpload({
        userId: session.user.id,
        kind: "back",
        url: backUrl.url,
        filename: backUrl.file.name,
        contentType: backUrl.file.type,
        size: backUrl.file.size,
      }),
      saveScreenshotUpload({
        userId: session.user.id,
        kind: "lay",
        url: layUrl.url,
        filename: layUrl.file.name,
        contentType: layUrl.file.type,
        size: layUrl.file.size,
      }),
    ]);
    timer.mark("dbSave");
    timer.log("screenshots/upload");

    return NextResponse.json({
      back: backRow,
      lay: layRow,
    });
  } catch (error) {
    console.error("Failed to upload screenshots", error);
    return NextResponse.json(
      { error: "Failed to upload screenshots" },
      { status: 500 }
    );
  }
}
