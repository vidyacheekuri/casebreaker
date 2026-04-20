/**
 * generate-characters.mjs
 *
 * Generates Tripo AI 3D models for every suspect in every case that doesn't
 * already have a GLB file cached in public/models/.
 *
 * Usage:
 *   node scripts/generate-characters.mjs            # skip already-generated
 *   node scripts/generate-characters.mjs --force    # re-generate everything
 *
 * Requires TRIPO_API_KEY in .env.local (same file Next.js reads).
 *
 * HOW TO ADD A NEW STORY:
 *   1. Create lib/cases/your-case.ts with suspects that have an `appearance` field.
 *   2. Add an entry to CASES below pointing at your suspect list.
 *   3. Run this script — it generates and saves the GLBs automatically.
 *   4. The game picks them up via AvatarCanvas (no other changes needed).
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT      = path.resolve(__dirname, "..");
const MODELS_DIR = path.join(ROOT, "public", "models");
const ENV_FILE   = path.join(ROOT, ".env.local");

// ─── Case registry ───────────────────────────────────────────────────────────
// Add new cases here. Each entry is a list of { id, name, appearance }.
// `id` must match the filename pattern: public/models/{id}.glb

const CASES = [
  {
    caseId: "harlow-manor",
    suspects: [
      {
        id: "fenn",
        name: "Dr. James Fenn",
        appearance:
          "Realistic 48-year-old British male physician, 1920s England. Wire-rimmed round spectacles, dark charcoal three-piece suit, white dress shirt, dark burgundy tie. Short salt-and-pepper hair, slight stubble. Tired but sharp eyes. Formal upright posture. Neutral T-pose, full body, clean topology.",
      },
      {
        id: "victoria",
        name: "Victoria Harlow",
        appearance:
          "Elegant 42-year-old British aristocratic woman, 1920s England. Dark silk evening dress with lace collar, pearl necklace, hair pinned up neatly. High cheekbones, pale skin, cold composed expression. Perfectly upright Edwardian posture. Neutral T-pose, full body, clean topology.",
      },
      {
        id: "oliver",
        name: "Oliver Harlow",
        appearance:
          "Anxious 28-year-old British young man, 1920s England. Slightly disheveled dark wool suit, loosened tie, rumpled white shirt. Short dark hair, nervous wide eyes, lean build. Tense restless posture, shoulders slightly hunched. Neutral T-pose, full body, clean topology.",
      },
    ],
  },
  // ── Add future cases here ──────────────────────────────────────────────────
  // {
  //   caseId: "your-new-case",
  //   suspects: [
  //     { id: "suspect_id", name: "Full Name", appearance: "..." },
  //   ],
  // },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function loadEnv() {
  if (!fs.existsSync(ENV_FILE)) return {};
  const env = {};
  for (const line of fs.readFileSync(ENV_FILE, "utf8").split("\n")) {
    const m = line.match(/^\s*([^#=\s]+)\s*=\s*"?([^"]*)"?\s*$/);
    if (m) env[m[1]] = m[2];
  }
  return env;
}

function log(msg)  { console.log(`  ${msg}`); }
function ok(msg)   { console.log(`  ✓ ${msg}`); }
function warn(msg) { console.log(`  ⚠ ${msg}`); }
function err(msg)  { console.error(`  ✗ ${msg}`); }

const TRIPO_BASE = "https://api.tripo3d.ai/v2/openapi";
const TERMINAL_OK  = new Set(["success", "succeeded", "completed", "done"]);
const TERMINAL_ERR = new Set(["failed", "error", "cancelled", "canceled", "timeout"]);

async function tripoPost(apiKey, path, body) {
  const res = await fetch(`${TRIPO_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Tripo POST ${path} → ${res.status}: ${await res.text()}`);
  return res.json();
}

async function tripoGet(apiKey, taskId) {
  const res = await fetch(`${TRIPO_BASE}/task/${taskId}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) throw new Error(`Tripo GET task/${taskId} → ${res.status}: ${await res.text()}`);
  return res.json();
}

async function pollUntilDone(apiKey, taskId, label, intervalMs = 5000, timeoutMs = 300_000) {
  const deadline = Date.now() + timeoutMs;
  let dots = 0;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, intervalMs));
    const data = await tripoGet(apiKey, taskId);
    const status = (data?.data?.status ?? data?.status ?? "").toLowerCase();
    process.stdout.write(`\r  ${label} — ${status}${".".repeat(++dots % 4)}   `);
    if (TERMINAL_OK.has(status))  { process.stdout.write("\n"); return data; }
    if (TERMINAL_ERR.has(status)) { process.stdout.write("\n"); throw new Error(`Task ${taskId} failed: ${status}`); }
  }
  throw new Error(`Task ${taskId} timed out after ${timeoutMs / 1000}s`);
}

function pickGlbUrl(data) {
  const candidates = [
    data?.data?.output?.model,
    data?.data?.result?.model,
    data?.data?.output?.pbr_model,
    data?.data?.result?.pbr_model,
    data?.output?.model,
    data?.result?.model,
  ];
  return candidates.find((u) => typeof u === "string" && /\.(glb|gltf)/i.test(u)) ?? null;
}

async function downloadGlb(url, destPath) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(destPath, buf);
  return buf.length;
}

// ─── Core pipeline ───────────────────────────────────────────────────────────

async function generateSuspect(apiKey, suspect, destPath) {
  log(`Generating ${suspect.name} (${suspect.id})…`);

  // Step 1 — text → static mesh
  log("Step 1: text_to_model");
  const step1Res = await tripoPost(apiKey, "/task", {
    type: "text_to_model",
    prompt: suspect.appearance,
  });
  const baseTaskId = step1Res?.data?.task_id ?? step1Res?.task_id;
  if (!baseTaskId) throw new Error("No task_id returned from text_to_model");
  log(`  task_id: ${baseTaskId}`);

  await pollUntilDone(apiKey, baseTaskId, "text_to_model");

  // Step 2 — static mesh → rigged GLB
  log("Step 2: animate_rig");
  const step2Res = await tripoPost(apiKey, "/task", {
    type: "animate_rig",
    original_model_task_id: baseTaskId,
  });
  const rigTaskId = step2Res?.data?.task_id ?? step2Res?.task_id;
  if (!rigTaskId) throw new Error("No task_id returned from animate_rig");
  log(`  task_id: ${rigTaskId}`);

  const rigData = await pollUntilDone(apiKey, rigTaskId, "animate_rig");

  // Extract + download GLB
  const glbUrl = pickGlbUrl(rigData);
  if (!glbUrl) throw new Error(`No GLB URL found in rig task response:\n${JSON.stringify(rigData, null, 2)}`);
  log(`Downloading GLB…`);
  const bytes = await downloadGlb(glbUrl, destPath);
  ok(`Saved ${suspect.id}.glb (${(bytes / 1_048_576).toFixed(1)} MB) → ${destPath}`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const force = process.argv.includes("--force");
  const suspectFlag = (() => {
    const i = process.argv.indexOf("--suspect");
    return i >= 0 ? process.argv[i + 1] : null;
  })();
  const env   = loadEnv();
  const apiKey = env.TRIPO_API_KEY ?? process.env.TRIPO_API_KEY;

  if (!apiKey) {
    err("TRIPO_API_KEY not found in .env.local or environment.");
    err("Add it:  echo 'TRIPO_API_KEY=your_key' >> .env.local");
    process.exit(1);
  }

  fs.mkdirSync(MODELS_DIR, { recursive: true });

  console.log("\n╔═ CaseBreaker AI — Character Model Generator ═══════════════╗");
  console.log(`║  Models dir: ${MODELS_DIR}`);
  console.log(`║  Force regen: ${force}`);
  if (suspectFlag) console.log(`║  Only suspect: ${suspectFlag}`);
  console.log("╚════════════════════════════════════════════════════════════╝\n");

  let generated = 0;
  let skipped   = 0;
  let failed    = 0;

  for (const { caseId, suspects } of CASES) {
    console.log(`\n── Case: ${caseId} ${"─".repeat(Math.max(0, 48 - caseId.length))}`);

    for (const suspect of suspects) {
      const destPath = path.join(MODELS_DIR, `${suspect.id}.glb`);
      const exists   = fs.existsSync(destPath);

      if (suspectFlag && suspect.id !== suspectFlag) {
        skipped++;
        continue;
      }

      if (exists && !force) {
        ok(`${suspect.id}.glb already exists — skipping (use --force to regen)`);
        skipped++;
        continue;
      }

      try {
        await generateSuspect(apiKey, suspect, destPath);
        generated++;
      } catch (e) {
        err(`Failed to generate ${suspect.id}: ${e.message}`);
        failed++;
      }

      console.log();
    }
  }

  console.log("\n╔═ Summary ═══════════════════════════════════╗");
  console.log(`║  Generated : ${generated}`);
  console.log(`║  Skipped   : ${skipped}`);
  console.log(`║  Failed    : ${failed}`);
  console.log("╚═════════════════════════════════════════════╝\n");

  if (failed > 0) process.exit(1);
}

main().catch((e) => { err(e.message); process.exit(1); });
