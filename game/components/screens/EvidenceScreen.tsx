"use client";

import { motion } from "framer-motion";
import { useEffect } from "react";
import { useGameStore } from "@/lib/store";
import CorkboardLayout from "@/components/ui/EvidenceBoard/CorkboardLayout";

export default function EvidenceScreen() {
  const {
    activeSlot,
    discoveredEvidence,
    reviewedEvidenceIds,
    accusationEvidenceIds,
    goTo,
    markEvidenceReviewed,
  } = useGameStore();

  useEffect(() => {
    if (!activeSlot) {
      goTo("intro");
    }
  }, [activeSlot, goTo]);

  if (!activeSlot) {
    return null;
  }

  const evidenceById = Object.fromEntries(
    activeSlot.evidence.map((evidence) => [evidence.evidence_id, evidence])
  );

  const discoveredCards = discoveredEvidence
    .map((id) => evidenceById[id])
    .filter((item): item is NonNullable<typeof item> => Boolean(item));

  const missingCount = Math.max(0, activeSlot.evidence.length - discoveredCards.length);

  return (
    <motion.div
      className="flex h-full flex-col"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.35 }}
    >
      <div className="flex items-center justify-between border-b border-white/10 bg-[rgba(7,14,26,0.7)] px-5 py-2.5 backdrop-blur-md">
        <div>
          <div className="text-[32px] font-bold uppercase leading-tight tracking-[4px] text-[#D4A843]">Evidence Board</div>
          <div className="mt-0.5 text-[13px] font-semibold text-[#E8E0D0]">
            {discoveredCards.length} of {activeSlot.evidence.length} clues collected
          </div>
        </div>
        <button
          onClick={() => goTo("manor")}
          className="text-label uppercase tracking-wider text-[#445566] transition-colors hover:text-[#C8D0DC]"
        >
          ← Back to Manor
        </button>
      </div>

      <div className="flex-1 overflow-hidden px-5 py-3">
        {discoveredCards.length === 0 ? (
          <div className="mt-20 text-center text-body italic text-[#556677]" style={{ fontFamily: "Georgia, serif" }}>
            No evidence collected yet. Search locations to discover clues.
          </div>
        ) : (
          <CorkboardLayout
            evidence={discoveredCards}
            activeSlot={activeSlot}
            reviewedEvidenceIds={reviewedEvidenceIds}
            accusationEvidenceIds={accusationEvidenceIds}
            onReview={markEvidenceReviewed}
          />
        )}

        {missingCount > 0 && (
          <div className="mt-2 text-label uppercase tracking-[3px] text-[#445566]">
            {missingCount} clues still undiscovered
          </div>
        )}
      </div>

      {discoveredCards.length >= Math.min(3, activeSlot.evidence.length) && (
        <motion.div
          className="border-t border-white/5 px-5 py-2.5"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          <button
            onClick={() => goTo("accusation")}
            className="w-full py-2.5 text-caption uppercase tracking-[3px]"
            style={{
              background: "rgba(212,168,67,.08)",
              border: "1px solid rgba(212,168,67,.3)",
              color: "#D4A843",
              fontFamily: "Georgia, serif",
            }}
          >
            Make Your Accusation →
          </button>
        </motion.div>
      )}
    </motion.div>
  );
}
