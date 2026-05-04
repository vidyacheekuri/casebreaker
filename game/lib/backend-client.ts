import type {
  AccuseRequest,
  AccuseResponse,
  DailySlotsMatchRequest,
  DailySlotsMatchResponse,
  DailySlotsResponse,
  EvidenceDto,
  InterrogateRequest,
  InterrogateResponse,
  SessionStartRequest,
  SessionStartResponse,
  SessionStateResponse,
} from "@/lib/backend-types";
import { buildEvidenceImagePrompt } from "@/lib/evidence-images";
import {
  AccuseResponseSchema,
  DailySlotsMatchResponseSchema,
  DailySlotsResponseSchema,
  InterrogateResponseSchema,
  SessionStartResponseSchema,
  SessionStateResponseSchema,
} from "@/lib/validation/schemas";
import { validateResponse } from "@/lib/validation/validate";
import type { ZodSchema } from "zod";

const PROXY_PREFIX = "/api/backend";

function normalizeErrorPayload(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const maybeDetail = (payload as { detail?: unknown }).detail;
  if (typeof maybeDetail === "string" && maybeDetail.trim()) {
    return maybeDetail;
  }

  const maybeError = (payload as { error?: unknown }).error;
  if (typeof maybeError === "string" && maybeError.trim()) {
    return maybeError;
  }

  return null;
}

export class BackendApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "BackendApiError";
    this.status = status;
  }
}

async function request<T>(path: string, schema: ZodSchema<T>, init?: RequestInit): Promise<T> {
  const response = await fetch(`${PROXY_PREFIX}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });

  const text = await response.text();
  let parsed: unknown = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = { detail: text };
    }
  }

  if (!response.ok) {
    const message = normalizeErrorPayload(parsed) ?? `Request failed (${response.status})`;
    throw new BackendApiError(response.status, message);
  }

  return validateResponse<T>(parsed, schema, { endpoint: path, payload: parsed });
}

export function getDailySlots(): Promise<DailySlotsResponse> {
  return request<DailySlotsResponse>("/daily-slots", DailySlotsResponseSchema, { method: "GET" });
}

export function matchDailySlot(payload: DailySlotsMatchRequest): Promise<DailySlotsMatchResponse> {
  return request<DailySlotsMatchResponse>("/daily-slots/match", DailySlotsMatchResponseSchema, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function startSession(payload: SessionStartRequest): Promise<SessionStartResponse> {
  return request<SessionStartResponse>("/sessions/start", SessionStartResponseSchema, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function interrogateSession(
  sessionId: string,
  payload: InterrogateRequest
): Promise<InterrogateResponse> {
  return request<InterrogateResponse>(`/sessions/${sessionId}/interrogate`, InterrogateResponseSchema, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function getSessionState(sessionId: string): Promise<SessionStateResponse> {
  return request<SessionStateResponse>(`/sessions/${sessionId}/state`, SessionStateResponseSchema, { method: "GET" });
}

export function accuseSession(sessionId: string, payload: AccuseRequest): Promise<AccuseResponse> {
  return request<AccuseResponse>(`/sessions/${sessionId}/accuse`, AccuseResponseSchema, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

const EVIDENCE_IMAGE_VERSION = "2.0";

/** Server-side cache metadata for a clue image (Next route in-memory cache). */
export async function fetchExistingImage(
  caseId: string,
  evidenceId: string
): Promise<{ url: string; version: string } | null> {
  try {
    const res = await fetch(
      `/api/evidence/generate-image?caseId=${encodeURIComponent(caseId)}&evidenceId=${encodeURIComponent(evidenceId)}`,
      { cache: "no-store" }
    );
    if (!res.ok) {
      return null;
    }
    const data = (await res.json()) as { url?: string; version?: string };
    if (typeof data.url !== "string" || !data.url || typeof data.version !== "string") {
      return null;
    }
    return { url: data.url, version: data.version };
  } catch {
    return null;
  }
}

/**
 * Resolve or generate evidence art without redundant OpenAI calls when a v2.0 cache exists.
 */
export async function generateEvidenceImage(caseId: string, evidence: EvidenceDto): Promise<EvidenceDto> {
  const prompt = evidence.image_prompt?.trim() || buildEvidenceImagePrompt(evidence);

  if (evidence.image_status === "ready" && evidence.image_url) {
    return { ...evidence, image_prompt: prompt };
  }

  const existing = await fetchExistingImage(caseId, evidence.evidence_id);
  if (existing?.version === EVIDENCE_IMAGE_VERSION) {
    return {
      ...evidence,
      image_url: existing.url,
      image_status: "ready",
      image_prompt: prompt,
      image_version: EVIDENCE_IMAGE_VERSION,
    };
  }

  const status = evidence.image_status ?? "idle";
  if (status !== "idle" && status !== "failed") {
    if (status === "generating") {
      return { ...evidence, image_prompt: prompt, image_status: "idle" };
    }
    return { ...evidence, image_prompt: prompt };
  }

  const response = await fetch("/api/evidence/generate-image", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ caseId, evidenceId: evidence.evidence_id, prompt }),
  });

  const payload = (await response.json()) as {
    error?: string;
    imageUrl?: string;
    version?: string;
    cached?: boolean;
  };

  if (!response.ok || !payload.imageUrl) {
    throw new Error(payload.error || "Evidence image generation failed");
  }

  return {
    ...evidence,
    image_url: payload.imageUrl,
    image_status: "ready",
    image_prompt: prompt,
    image_version: payload.version ?? EVIDENCE_IMAGE_VERSION,
  };
}
