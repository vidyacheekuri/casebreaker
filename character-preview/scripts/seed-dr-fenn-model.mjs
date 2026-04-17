import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const API_BASE_URL = process.env.SEED_API_BASE_URL ?? "http://localhost:3000";
const TARGET_PATH =
  process.env.SEED_MODEL_OUTPUT_PATH ?? "public/models/dr_fenn_tripo.glb";

async function main() {
  const endpoint = `${API_BASE_URL}/api/tripo-model?regenerate=1`;
  console.log(`Requesting Tripo model from ${endpoint}`);

  const metaRes = await fetch(endpoint);
  const meta = await metaRes.json();

  if (!metaRes.ok || !meta?.modelUrl || meta?.source === "fallback") {
    throw new Error(
      `Model generation failed: ${JSON.stringify(meta)}`
    );
  }

  console.log(`Downloading GLB from ${meta.modelUrl}`);
  const modelRes = await fetch(meta.modelUrl);
  if (!modelRes.ok) {
    throw new Error(`GLB download failed (${modelRes.status})`);
  }

  const buffer = Buffer.from(await modelRes.arrayBuffer());
  const outputPath = resolve(process.cwd(), TARGET_PATH);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, buffer);

  console.log(`Saved model to ${outputPath}`);
  console.log("Done. App now uses /models/dr_fenn_tripo.glb by default.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

