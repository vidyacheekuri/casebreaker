import type { EvidenceDto } from "@/lib/backend-types";

const EVIDENCE_IMAGE_STYLE =
  "single detective evidence object, centered, dark neutral background, cinematic inventory render, highly readable, no people, no hands, no clutter";

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

export function buildEvidenceImagePrompt(evidence: EvidenceDto): string {
  return [
    EVIDENCE_IMAGE_STYLE,
    `primary object: ${trimPromptSegment(evidence.name, 80)}`,
    `forensic details: ${trimPromptSegment(evidence.description, 220)}`,
    `context hint: recovered from ${trimPromptSegment(evidence.location, 80)}`,
    "focus on one object only, realistic materials, dramatic but restrained lighting, no readable text, no labels, no watermark",
  ].join(", ");
}

export function readEvidenceImageCache(
  _caseId: string,
  _evidenceId: string
): EvidenceImageCacheEntry | null {
  return null;
}

export function writeEvidenceImageCache(_entry: EvidenceImageCacheEntry): void {
  return;
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
