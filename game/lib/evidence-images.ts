import type { EvidenceDto } from "@/lib/backend-types";

const EVIDENCE_IMAGE_STYLE =
  "single detective evidence object, centered, dark neutral background, cinematic inventory render, highly readable, no people, no hands, no clutter";

/** Prefix for localStorage keys (store prunes these on session quota errors). */
export const EVIDENCE_IMAGE_CACHE_KEY_PREFIX = "casebreaker:evidence-image";

const MAX_CACHED_URL_LENGTH = 2_400_000;

export interface EvidenceImageCacheEntry {
  caseId: string;
  evidenceId: string;
  imageUrl: string;
  prompt: string;
  cachedAt: number;
}

function trimPromptSegment(value: string, maxLength: number): string {
  return value.trim().replace(/\s+/g, " ").slice(0, maxLength);
}

function storageKey(caseId: string, evidenceId: string): string {
  return `${EVIDENCE_IMAGE_CACHE_KEY_PREFIX}:${caseId}:${evidenceId}`;
}

export function buildEvidenceImagePrompt(evidence: EvidenceDto): string {
  return [
    EVIDENCE_IMAGE_STYLE,
    `primary object: ${trimPromptSegment(evidence.name, 80)}`,
    `forensic details: ${trimPromptSegment(evidence.description, 220)}`,
    `context hint: recovered from ${trimPromptSegment(evidence.location, 80)}`,
    "focus on one object only, realistic materials, dramatic but restrained lighting, no readable text, no labels, no watermark",
  ].join(", ");
}

export function readEvidenceImageCache(caseId: string, evidenceId: string): EvidenceImageCacheEntry | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const raw = window.localStorage.getItem(storageKey(caseId, evidenceId));
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as Partial<EvidenceImageCacheEntry>;
    if (
      typeof parsed.imageUrl !== "string" ||
      !parsed.imageUrl ||
      parsed.caseId !== caseId ||
      parsed.evidenceId !== evidenceId
    ) {
      return null;
    }
    return {
      caseId,
      evidenceId,
      imageUrl: parsed.imageUrl,
      prompt: typeof parsed.prompt === "string" ? parsed.prompt : "",
      cachedAt: typeof parsed.cachedAt === "number" ? parsed.cachedAt : 0,
    };
  } catch {
    return null;
  }
}

function listCacheKeys(): string[] {
  const keys: string[] = [];
  for (let i = 0; i < window.localStorage.length; i += 1) {
    const k = window.localStorage.key(i);
    if (k?.startsWith(EVIDENCE_IMAGE_CACHE_KEY_PREFIX)) {
      keys.push(k);
    }
  }
  return keys;
}

function pruneOldestEvidenceImageEntries(targetRemove: number): void {
  const keys = listCacheKeys();
  const withMeta: { key: string; at: number }[] = [];

  for (const key of keys) {
    try {
      const raw = window.localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw) as { cachedAt?: number };
      withMeta.push({ key, at: typeof parsed.cachedAt === "number" ? parsed.cachedAt : 0 });
    } catch {
      withMeta.push({ key, at: 0 });
    }
  }

  withMeta.sort((a, b) => a.at - b.at);
  for (let i = 0; i < Math.min(targetRemove, withMeta.length); i += 1) {
    window.localStorage.removeItem(withMeta[i].key);
  }
}

export function writeEvidenceImageCache(entry: EvidenceImageCacheEntry): void {
  if (typeof window === "undefined") {
    return;
  }
  if (entry.imageUrl.length > MAX_CACHED_URL_LENGTH) {
    return;
  }
  const payload = JSON.stringify({
    ...entry,
    cachedAt: entry.cachedAt || Date.now(),
  });
  try {
    window.localStorage.setItem(storageKey(entry.caseId, entry.evidenceId), payload);
  } catch {
    try {
      pruneOldestEvidenceImageEntries(Math.max(4, Math.ceil(listCacheKeys().length / 2)));
      window.localStorage.setItem(storageKey(entry.caseId, entry.evidenceId), payload);
    } catch {
      /* ignore quota */
    }
  }
}

export async function requestEvidenceImageGeneration(input: {
  caseId: string;
  evidenceId: string;
  prompt: string;
}): Promise<{ imageUrl: string; cached: boolean; provider?: string; model?: string }> {
  const response = await fetch("/api/evidence/generate-image", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });

  const payload = (await response.json()) as {
    error?: string;
    imageUrl?: string;
    provider?: string;
    model?: string;
    cached?: boolean;
  };

  if (!response.ok || !payload.imageUrl) {
    throw new Error(payload.error || "Evidence image generation failed");
  }

  return {
    imageUrl: payload.imageUrl,
    cached: Boolean(payload.cached),
    provider: payload.provider,
    model: payload.model,
  };
}
