import { readFile, stat } from "fs/promises";
import { join } from "path";
import { NextRequest, NextResponse } from "next/server";

const ALLOWED = /\.(fbx|glb|gltf|bin)$/i;

const MIME: Record<string, string> = {
  fbx: "application/octet-stream",
  glb: "model/gltf-binary",
  gltf: "model/gltf+json",
  bin: "application/octet-stream",
};

function resolvePath(file: string): string | null {
  // Prevent path traversal
  if (file.includes("..") || file.includes("/") || file.includes("\\")) return null;
  if (!ALLOWED.test(file)) return null;
  return join(process.cwd(), "public", "models", file);
}

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ file: string }> }
) {
  const { file } = await context.params;
  const filePath = resolvePath(file);

  if (!filePath) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  try {
    const data = await readFile(filePath);
    const ext = file.split(".").pop()?.toLowerCase() ?? "";
    return new NextResponse(data, {
      status: 200,
      headers: {
        "Content-Type": MIME[ext] ?? "application/octet-stream",
        "Content-Length": data.length.toString(),
        "Cache-Control": "public, max-age=86400, immutable",
      },
    });
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}

export async function HEAD(
  _req: NextRequest,
  context: { params: Promise<{ file: string }> }
) {
  const { file } = await context.params;
  const filePath = resolvePath(file);

  if (!filePath) {
    return new NextResponse(null, { status: 403 });
  }

  try {
    const info = await stat(filePath);
    const ext = file.split(".").pop()?.toLowerCase() ?? "";
    return new NextResponse(null, {
      status: 200,
      headers: {
        "Content-Type": MIME[ext] ?? "application/octet-stream",
        "Content-Length": info.size.toString(),
      },
    });
  } catch {
    return new NextResponse(null, { status: 404 });
  }
}
