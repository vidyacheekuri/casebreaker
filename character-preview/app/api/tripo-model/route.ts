import { generateDrFennModel } from "@/lib/tripoService";
import { access, mkdir, writeFile } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import path from "node:path";

export const runtime = "nodejs";

const LOCAL_MODEL_URL = "/models/dr_fenn_tripo.glb";
const LOCAL_MODEL_ABS_PATH = path.join(process.cwd(), "public", "models", "dr_fenn_tripo.glb");

type CachedModel = {
  glbUrl: string;
  generatedAtIso: string;
  taskId: string;
};

let cachedModel: CachedModel | null = null;
let inflightGeneration: Promise<CachedModel> | null = null;

async function localModelExists() {
  try {
    await access(LOCAL_MODEL_ABS_PATH, fsConstants.F_OK | fsConstants.R_OK);
    return true;
  } catch {
    return false;
  }
}

async function persistModelToLocalFile(remoteUrl: string) {
  const res = await fetch(remoteUrl);
  if (!res.ok) {
    throw new Error(`Failed to download generated model (${res.status}).`);
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  await mkdir(path.dirname(LOCAL_MODEL_ABS_PATH), { recursive: true });
  await writeFile(LOCAL_MODEL_ABS_PATH, buffer);
}

async function generateAndCacheModel(): Promise<CachedModel> {
  const result = await generateDrFennModel();
  if (!result.glbUrl) {
    throw new Error("Tripo completed without a GLB URL.");
  }
  await persistModelToLocalFile(result.glbUrl);
  const record: CachedModel = {
    glbUrl: LOCAL_MODEL_URL,
    generatedAtIso: new Date().toISOString(),
    taskId: result.taskId,
  };
  cachedModel = record;
  return record;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const regenerate = url.searchParams.get("regenerate") === "1";

  try {
    if (!regenerate && (cachedModel || (await localModelExists()))) {
      if (!cachedModel) {
        cachedModel = {
          glbUrl: LOCAL_MODEL_URL,
          generatedAtIso: new Date().toISOString(),
          taskId: "local-file",
        };
      }
      return Response.json({
        modelUrl: cachedModel.glbUrl,
        source: "local",
        generatedAtIso: cachedModel.generatedAtIso,
        taskId: cachedModel.taskId,
      });
    }

    if (!inflightGeneration) {
      inflightGeneration = generateAndCacheModel().finally(() => {
        inflightGeneration = null;
      });
    }

    const generated = await inflightGeneration;
    return Response.json({
      modelUrl: generated.glbUrl,
      source: "tripo",
      generatedAtIso: generated.generatedAtIso,
      taskId: generated.taskId,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown Tripo error";
    const fallbackUrl = process.env.FALLBACK_MODEL_URL || "/models/brian.glb";
    return Response.json(
      {
        error: message,
        modelUrl: fallbackUrl,
        source: "fallback",
      },
      { status: 502 }
    );
  }
}

