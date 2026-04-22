"use client";

import { useEffect, useRef } from "react";
import { useGameStore } from "@/lib/store";
import {
  buildEvidenceImagePrompt,
  readEvidenceImageCache,
  requestEvidenceImageGeneration,
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
          });
        }
        continue;
      }

      if (
        item.image_status === "ready" ||
        item.image_status === "generating" ||
        item.image_status === "failed"
      ) {
        continue;
      }

      if (inFlightRef.current.has(cacheKey)) {
        continue;
      }

      inFlightRef.current.add(cacheKey);
      console.log("[evidence-images] generating", {
        caseId: activeSlot.slot_id,
        evidenceId: item.evidence_id,
      });

      updateEvidenceImage(item.evidence_id, {
        image_url: item.image_url,
        image_prompt: prompt,
        image_status: "generating",
      });

      void requestEvidenceImageGeneration({
        caseId: activeSlot.slot_id,
        evidenceId: item.evidence_id,
        prompt,
      })
        .then(({ imageUrl, cached: fromServerCache, provider, model }) => {
          console.log("[evidence-images] ready", {
            caseId: activeSlot.slot_id,
            evidenceId: item.evidence_id,
            fromServerCache,
            provider,
            model,
          });

          writeEvidenceImageCache({
            caseId: activeSlot.slot_id,
            evidenceId: item.evidence_id,
            imageUrl,
            prompt,
            cachedAt: Date.now(),
          });

          updateEvidenceImage(item.evidence_id, {
            image_url: imageUrl,
            image_prompt: prompt,
            image_status: "ready",
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
          });
        })
        .finally(() => {
          inFlightRef.current.delete(cacheKey);
        });
    }
  }, [activeSlot, screen, updateEvidenceImage]);

  return null;
}
