import { readFile } from "node:fs/promises";
import path from "node:path";
import type { RigReport } from "@/lib/character-pipeline";

interface GLTFJson {
  meshes?: Array<{ primitives?: Array<{ targets?: unknown[] }> }>;
  nodes?: Array<{ name?: string }>;
}

function parseGLBJson(buffer: Buffer): GLTFJson {
  if (buffer.toString("utf8", 0, 4) !== "glTF") {
    throw new Error("Unsupported model format. Expected .glb");
  }

  const totalLength = buffer.readUInt32LE(8);
  let offset = 12;
  let json = "";

  while (offset < totalLength) {
    const chunkLength = buffer.readUInt32LE(offset);
    const chunkType = buffer.readUInt32LE(offset + 4);
    offset += 8;
    const chunk = buffer.slice(offset, offset + chunkLength);
    offset += chunkLength;

    if (chunkType === 0x4e4f534a) {
      json = chunk.toString("utf8").replace(/\u0000+$/g, "");
      break;
    }
  }

  if (!json) throw new Error("GLB JSON chunk missing");
  return JSON.parse(json) as GLTFJson;
}

async function loadModelBuffer(modelUrl: string): Promise<Buffer> {
  if (modelUrl.startsWith("/")) {
    const fullPath = path.join(process.cwd(), "public", modelUrl.replace(/^\//, ""));
    return readFile(fullPath);
  }

  const res = await fetch(modelUrl);
  if (!res.ok) {
    throw new Error(`Unable to fetch model: ${modelUrl} (${res.status})`);
  }
  const arr = await res.arrayBuffer();
  return Buffer.from(arr);
}

export async function validateModelRig(modelUrl: string): Promise<RigReport> {
  const issues: string[] = [];

  try {
    const buffer = await loadModelBuffer(modelUrl);
    const gltf = parseGLBJson(buffer);
    const nodeNames = (gltf.nodes ?? []).map((n) => (n.name ?? "").toLowerCase());
    const hasHeadBone = nodeNames.some((name) => name.includes("head"));
    const hasJawBone = nodeNames.some((name) => name.includes("jaw"));

    const morphTargetCount = (gltf.meshes ?? []).reduce((count, mesh) => {
      const meshTargets = (mesh.primitives ?? []).reduce((acc, primitive) => {
        return acc + (primitive.targets?.length ?? 0);
      }, 0);
      return count + meshTargets;
    }, 0);

    const hasMorphTargets = morphTargetCount > 0;
    const lipRig: RigReport["lipRig"] = hasMorphTargets
      ? "morphTargets"
      : hasJawBone
        ? "jawBone"
        : "none";

    if (!hasHeadBone) issues.push("No head bone detected.");
    if (lipRig === "none") issues.push("No lip rig detected (no morph targets/jaw).");

    return {
      lipRig,
      hasHeadBone,
      hasMorphTargets,
      hasJawBone,
      morphTargetCount,
      issues,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown rig validation error";
    return {
      lipRig: "none",
      hasHeadBone: false,
      hasMorphTargets: false,
      hasJawBone: false,
      morphTargetCount: 0,
      issues: [message],
    };
  }
}
