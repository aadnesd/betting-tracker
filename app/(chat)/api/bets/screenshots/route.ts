import { Buffer } from "node:buffer";
import { put } from "@vercel/blob";
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/app/(auth)/auth";
import { isTestEnvironment } from "@/lib/constants";
import { saveScreenshotUpload } from "@/lib/db/queries";

const FileSchema = z.instanceof(Blob).refine((file) => {
  return (
    file.size <= 8 * 1024 * 1024 &&
    ["image/jpeg", "image/png"].includes(file.type)
  );
});

export async function POST(request: Request) {
  const session = await auth();

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const formData = await request.formData();
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
        return { url: `data:${file.type};base64,${base64}`, file };
      }

      const key = `${session.user.id}/${Date.now()}-${file.name}`;
      const result = await put(key, arrayBuffer, {
        access: "public",
        contentType: file.type,
      });
      return { url: result.url, file };
    };

    const [backUrl, layUrl] = await Promise.all([toUrl(back), toUrl(lay)]);

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
