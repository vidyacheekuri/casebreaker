"use server";

import Anthropic from "@anthropic-ai/sdk";

const DEFAULT_TRIPO_BASE_URL = "https://api.tripo3d.ai/v2/openapi";
const DEFAULT_DR_FENN_PROMPT =
  "Dr. Fenn, middle-aged scientist, realistic human male, 1920s style lab coat, expressive face, detailed mouth and facial rig, neutral pose";

const TERMINAL_SUCCESS = new Set(["success", "succeeded", "completed", "done"]);
const TERMINAL_FAILURE = new Set(["failed", "error", "cancelled", "canceled", "timeout"]);

export interface TripoTaskStatus {
  taskId: string;
  status: string;
  glbUrl: string | null;
  rawStatus: unknown;
}

export interface TripoGenerationResult extends TripoTaskStatus {
  prompt: string;
}

function isImageAsset(url: string) {
  return /\.(png|jpe?g|webp|gif|bmp|svg)(\?|$)/i.test(url);
}

function isGltfAsset(url: string) {
  return /\.(glb|gltf)(\?|$)/i.test(url);
}

function isFbxAsset(url: string) {
  return /\.fbx(\?|$)/i.test(url);
}

function getTripoBaseUrl() {
  return (process.env.TRIPO_BASE_URL ?? DEFAULT_TRIPO_BASE_URL).replace(/\/+$/, "");
}

function getTripoApiKey() {
  const key = process.env.TRIPO_API_KEY;
  if (!key) {
    throw new Error("TRIPO_API_KEY is not configured.");
  }
  return key;
}

function getAnthropicClient() {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  return new Anthropic({ apiKey: key });
}

function wait(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

async function generateTripoPromptWithClaude(seedPrompt: string): Promise<string> {
  const anthropic = getAnthropicClient();
  if (!anthropic) return seedPrompt;

  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 220,
    temperature: 0.3,
    system:
      "You write concise, high-quality text-to-3D prompts for realistic human characters. Return only the final prompt text.",
    messages: [
      {
        role: "user",
        content: `Create a Tripo V3.0 text-to-3D prompt for this character concept:\n${seedPrompt}\n\nRequirements:\n- Realistic adult human\n- Clear facial details for blendshape support\n- Full body with lab coat\n- Neutral standing pose\n- Keep under 80 words`,
      },
    ],
  });

  const text = response.content
    .filter((block) => block.type === "text")
    .map((block) => block.text.trim())
    .join(" ")
    .trim();

  return text || seedPrompt;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object") return null;
  return value as Record<string, unknown>;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function pickTaskId(payload: unknown): string | null {
  const root = asRecord(payload);
  if (!root) return null;

  const direct =
    asString(root.taskId) ??
    asString(root.task_id) ??
    asString(root.id) ??
    asString(root.uuid);
  if (direct) return direct;

  const data = asRecord(root.data);
  if (!data) return null;
  return (
    asString(data.taskId) ??
    asString(data.task_id) ??
    asString(data.id) ??
    asString(data.uuid)
  );
}

function pickStatus(payload: unknown): string {
  const root = asRecord(payload);
  if (!root) return "unknown";
  const data = asRecord(root.data);
  return (
    asString(root.status) ??
    asString(root.state) ??
    asString(data?.status) ??
    asString(data?.state) ??
    "unknown"
  ).toLowerCase();
}

function pickGlbUrl(payload: unknown): string | null {
  const root = asRecord(payload);
  if (!root) return null;
  const data = asRecord(root.data);
  const output = asRecord(data?.output ?? root.output);

  const candidates: unknown[] = [
    output?.glb_url,
    output?.glbUrl,
    output?.model_url,
    output?.modelUrl,
    output?.url,
    data?.glb_url,
    data?.glbUrl,
    data?.model_url,
    data?.modelUrl,
    root.glb_url,
    root.glbUrl,
    root.model_url,
    root.modelUrl,
  ];

  const normalized = candidates
    .map((value) => asString(value))
    .filter((value): value is string => Boolean(value));
  const isModelAsset = (url: string) =>
    /\.(glb|gltf|fbx|obj|usdz)(\?|$)/i.test(url) || /\/(model|mesh|asset)[^/]*($|\?)/i.test(url);

  const directGlb = normalized.find((value) => isGltfAsset(value));
  if (directGlb) return directGlb;
  const directFbx = normalized.find((value) => isFbxAsset(value));
  if (directFbx) return directFbx;
  const directModelUrl = normalized.find(
    (value) => /^https?:\/\//i.test(value) && isModelAsset(value) && !isImageAsset(value)
  );
  if (directModelUrl) return directModelUrl;
  const directUrl = normalized.find(
    (value) => /^https?:\/\//i.test(value) && !isImageAsset(value)
  );
  if (directUrl) return directUrl;

  // Fallback: scan arrays like outputs/files/assets for a .glb URL.
  const arrays: unknown[] = [
    output?.files,
    output?.assets,
    output?.models,
    data?.files,
    data?.assets,
    data?.models,
    root.files,
    root.assets,
    root.models,
  ];
  for (const list of arrays) {
    if (!Array.isArray(list)) continue;
    for (const item of list) {
      if (typeof item === "string") {
        if (isGltfAsset(item)) return item;
        if (isFbxAsset(item)) return item;
        if (/^https?:\/\//i.test(item) && isModelAsset(item) && !isImageAsset(item)) {
          return item;
        }
      }
      const record = asRecord(item);
      const nested =
        asString(record?.url) ??
        asString(record?.glb_url) ??
        asString(record?.glbUrl) ??
        asString(record?.model_url) ??
        asString(record?.modelUrl);
      if (nested) {
        if (isGltfAsset(nested)) return nested;
        if (isFbxAsset(nested)) return nested;
        if (
          /^https?:\/\//i.test(nested) &&
          isModelAsset(nested) &&
          !isImageAsset(nested)
        ) {
          return nested;
        }
      }
    }
  }

  // Last resort: recursively scan for a usable URL.
  const seen = new Set<unknown>();
  const queue: unknown[] = [root];
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || seen.has(current)) continue;
    seen.add(current);

    if (typeof current === "string") {
      if (isGltfAsset(current)) return current;
      if (isFbxAsset(current)) return current;
      if (
        /^https?:\/\//i.test(current) &&
        isModelAsset(current) &&
        !isImageAsset(current)
      ) {
        return current;
      }
      continue;
    }
    if (Array.isArray(current)) {
      for (const item of current) queue.push(item);
      continue;
    }
    const record = asRecord(current);
    if (!record) continue;
    for (const value of Object.values(record)) queue.push(value);
  }

  return null;
}

async function submitConvertModelTask(originalTaskId: string) {
  const payload = await tripoRequest("/task", {
    method: "POST",
    body: JSON.stringify({
      type: "convert_model",
      original_model_task_id: originalTaskId,
      format: "GLTF",
      quad: true,
      bake: true,
      texture_format: "WEBP",
    }),
  });
  const taskId = pickTaskId(payload);
  if (!taskId) {
    throw new Error("Tripo convert_model submission succeeded but no task id was returned.");
  }
  return taskId;
}

async function tripoRequest<T = unknown>(
  path: string,
  init: RequestInit
): Promise<T> {
  const key = getTripoApiKey();
  const base = getTripoBaseUrl();
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
      ...(init.headers ?? {}),
    },
  });

  const bodyText = await res.text();
  let body: unknown = null;
  try {
    body = bodyText ? JSON.parse(bodyText) : null;
  } catch {
    body = bodyText;
  }

  if (!res.ok) {
    const details =
      typeof body === "string" ? body : JSON.stringify(body ?? { error: "unknown" });
    throw new Error(`Tripo request failed (${res.status}): ${details}`);
  }

  return body as T;
}

export async function submitDrFennTextToModel(prompt = DEFAULT_DR_FENN_PROMPT) {
  const taskBody: Record<string, unknown> = {
    type: "text_to_model",
    model_version: "v3.0",
    prompt,
    texture: true,
    pbr: true,
    quad: true,
    face_rig: true,
    workflow: "animation",
  };

  async function postTask(body: Record<string, unknown>) {
    return tripoRequest("/task", {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  let payload: unknown;
  const attempts: Array<{ label: string; body: Record<string, unknown> }> = [
    { label: "full", body: { ...taskBody } },
    {
      label: "no_workflow",
      body: (() => {
        const b = { ...taskBody };
        Reflect.deleteProperty(b, "workflow");
        return b;
      })(),
    },
    {
      label: "no_face_rig",
      body: (() => {
        const b = { ...taskBody };
        Reflect.deleteProperty(b, "face_rig");
        Reflect.deleteProperty(b, "workflow");
        return b;
      })(),
    },
    {
      label: "no_model_version",
      body: (() => {
        const b = { ...taskBody };
        Reflect.deleteProperty(b, "model_version");
        return b;
      })(),
    },
    {
      label: "minimal",
      body: (() => {
        const b = { ...taskBody };
        Reflect.deleteProperty(b, "model_version");
        Reflect.deleteProperty(b, "face_rig");
        Reflect.deleteProperty(b, "workflow");
        return b;
      })(),
    },
  ];

  let lastError: unknown = null;
  for (const attempt of attempts) {
    try {
      payload = await postTask(attempt.body);
      lastError = null;
      break;
    } catch (error) {
      lastError = error;
      const message = (error instanceof Error ? error.message : String(error)).toLowerCase();
      const isParamError =
        message.includes("invalid") ||
        message.includes("unknown") ||
        message.includes("not allowed") ||
        message.includes("unsupported");
      if (!isParamError) throw error;
    }
  }
  if (lastError) throw lastError;
  const taskId = pickTaskId(payload);
  if (!taskId) {
    throw new Error("Tripo task submission succeeded but no task id was returned.");
  }
  return { taskId, rawStatus: payload };
}

async function fetchTaskStatus(taskId: string): Promise<TripoTaskStatus> {
  // First try /task/:id (requested API family), then fallback to /tasks/:id for compatibility.
  let payload: unknown;
  try {
    payload = await tripoRequest(`/task/${taskId}`, { method: "GET" });
  } catch {
    payload = await tripoRequest(`/tasks/${taskId}`, { method: "GET" });
  }
  return {
    taskId,
    status: pickStatus(payload),
    glbUrl: pickGlbUrl(payload),
    rawStatus: payload,
  };
}

export async function pollTripoTask(
  taskId: string,
  options?: { timeoutMs?: number; initialIntervalMs?: number; maxIntervalMs?: number }
): Promise<TripoTaskStatus> {
  const timeoutMs = options?.timeoutMs ?? 8 * 60 * 1000;
  let intervalMs = options?.initialIntervalMs ?? 2500;
  const maxIntervalMs = options?.maxIntervalMs ?? 10_000;
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const status = await fetchTaskStatus(taskId);
    if (TERMINAL_SUCCESS.has(status.status)) {
      if (!status.glbUrl) {
        throw new Error("Tripo task completed but did not return a .glb URL.");
      }
      return status;
    }
    if (TERMINAL_FAILURE.has(status.status)) {
      throw new Error(`Tripo task failed with status: ${status.status}`);
    }

    await wait(intervalMs);
    intervalMs = Math.min(Math.round(intervalMs * 1.25), maxIntervalMs);
  }

  throw new Error(`Timed out waiting for Tripo task ${taskId}.`);
}

export async function generateDrFennModel(prompt = DEFAULT_DR_FENN_PROMPT): Promise<TripoGenerationResult> {
  const finalizedPrompt = await generateTripoPromptWithClaude(prompt);
  const submitted = await submitDrFennTextToModel(finalizedPrompt);
  let done = await pollTripoTask(submitted.taskId);

  // If Tripo returns FBX, run a conversion task so the front-end can load via useGLTF.
  if (done.glbUrl && isFbxAsset(done.glbUrl)) {
    const convertTaskId = await submitConvertModelTask(done.taskId);
    const converted = await pollTripoTask(convertTaskId);
    if (!converted.glbUrl) {
      throw new Error("Tripo conversion completed without a model URL.");
    }
    done = converted;
  }

  if (!done.glbUrl || !isGltfAsset(done.glbUrl)) {
    throw new Error(
      `Tripo returned unsupported model URL format: ${done.glbUrl ?? "none"}`
    );
  }
  return {
    taskId: done.taskId,
    status: done.status,
    glbUrl: done.glbUrl,
    rawStatus: done.rawStatus,
    prompt: finalizedPrompt,
  };
}

