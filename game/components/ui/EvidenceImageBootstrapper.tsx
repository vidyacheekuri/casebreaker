"use client";

import { useEffect, useRef } from "react";
import { generateEvidenceImage } from "@/lib/backend-client";
import { useGameStore } from "@/lib/store";
import {
  buildEvidenceImagePrompt,
  readEvidenceImageCache,
  writeEvidenceImageCache,
} from "@/lib/evidence-images";

export default function EvidenceImageBootstrapper() {
  const { screen, activeSlot, updateEvidenceImage } = useGameStore();
  const inFlightRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (screen === "intro" || !activeSlot) {
      return;
    }

    for (const item of activeSlot.evidence) {
      const prompt = item.image_prompt?.trim() || buildEvidenceImagePrompt(item);
      const cacheKey = `${activeSlot.slot_id}:${item.evidence_id}`;
      const cached = readEvidenceImageCache(activeSlot.slot_id, item.evidence_id);

      if (cached?.imageUrl) {
        if (item.image_url !== cached.imageUrl || item.image_status !== "ready") {
          updateEvidenceImage(item.evidence_id, {
            image_url: cached.imageUrl,
            image_prompt: prompt,
            image_status: "ready",
            image_version: "2.0",
          });
        }
        continue;
      }

      if (item.image_status === "ready" && item.image_url) {
        continue;
      }

      if (inFlightRef.current.has(cacheKey)) {
        continue;
      }

      inFlightRef.current.add(cacheKey);

      const shouldShowProgress =
        item.image_status === "idle" || item.image_status === "failed" || item.image_status === "generating";
      if (shouldShowProgress) {
        updateEvidenceImage(item.evidence_id, {
          image_url: item.image_url,
          image_prompt: prompt,
          image_status: "generating",
        });
      }

      void generateEvidenceImage(activeSlot.slot_id, item)
        .then((next) => {
          if (next.image_status === "ready" && next.image_url) {
            writeEvidenceImageCache({
              caseId: activeSlot.slot_id,
              evidenceId: item.evidence_id,
              imageUrl: next.image_url,
              prompt,
              cachedAt: Date.now(),
            });
          }

          updateEvidenceImage(item.evidence_id, {
            image_url: next.image_url,
            image_prompt: next.image_prompt ?? prompt,
            image_status: next.image_status,
            image_version: next.image_version,
          });
        })
        .catch((error) => {
          console.warn("[evidence-images] failed", {
            caseId: activeSlot.slot_id,
            evidenceId: item.evidence_id,
            error,
          });

          updateEvidenceImage(item.evidence_id, {
            image_url: undefined,
            image_prompt: prompt,
            image_status: "failed",
            image_version: undefined,
          });
        })
        .finally(() => {
          inFlightRef.current.delete(cacheKey);
        });
    }
  }, [activeSlot, screen, updateEvidenceImage]);

  return null;
}
