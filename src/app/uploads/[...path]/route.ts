import { readFile } from "node:fs/promises";
import path from "node:path";
import { uploadedFile } from "@/server/storage";

/**
 * Serves admin uploads kept on a persistent disk (UPLOAD_DIR, e.g. a Railway
 * volume). Without UPLOAD_DIR, local uploads are plain files in public/uploads
 * and never reach this route.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const uploadDir = process.env.UPLOAD_DIR;
  const file = uploadedFile((await params).path);
  if (!uploadDir || !file) return new Response("Not found", { status: 404 });

  try {
    const bytes = await readFile(path.join(uploadDir, file.relative));
    return new Response(bytes, {
      headers: {
        "Content-Type": file.contentType,
        // Every upload gets a new random name, so a stored file never changes.
        "Cache-Control": "public, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return new Response("Not found", { status: 404 });
    throw error;
  }
}
