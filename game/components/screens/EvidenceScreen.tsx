"use client";

import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { useGameStore } from "@/lib/store";

export default function EvidenceScreen() {
  const { activeSlot, discoveredEvidence, goTo } = useGameStore();
  const [selectedEvidenceId, setSelectedEvidenceId] = useState<string | null>(null);

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
      <div className="flex items-center justify-between border-b border-white/5 px-5 py-3">
        <div>
          <div className="text-[10px] uppercase tracking-[4px] text-[#D4A843]">Evidence Board</div>
          <div className="mt-0.5 text-[10px] text-[#334455]">
            {discoveredCards.length} of {activeSlot.evidence.length} clues collected
          </div>
        </div>
        <button
          onClick={() => goTo("manor")}
          className="text-[10px] uppercase tracking-wider text-[#445566] transition-colors hover:text-[#C8D0DC]"
        >
          ← Back to Investigation
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4">
        {discoveredCards.length === 0 ? (
          <div className="mt-20 text-center text-sm italic text-[#556677]" style={{ fontFamily: "Georgia, serif" }}>
            No evidence collected yet. Search locations to discover clues.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {discoveredCards.map((evidence) => {
              const selected = selectedEvidenceId === evidence.evidence_id;
              return (
                <motion.button
                  key={evidence.evidence_id}
                  onClick={() =>
                    setSelectedEvidenceId(selectedEvidenceId === evidence.evidence_id ? null : evidence.evidence_id)
                  }
                  className="border p-4 text-left"
                  style={{
                    background: selected ? "rgba(212,168,67,.08)" : "rgba(255,255,255,.02)",
                    borderColor: selected ? "rgba(212,168,67,.45)" : "rgba(255,255,255,.1)",
                  }}
                  whileHover={{ borderColor: "rgba(212,168,67,.38)" }}
                >
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-semibold tracking-wide text-[#E8E0D0]">{evidence.name}</div>
                    <div className="text-[10px] text-[#D4A843]">{selected ? "▲" : "▼"}</div>
                  </div>
                  <div className="mt-1 text-[9px] uppercase tracking-wider text-[#667788]">{evidence.location}</div>

                  {selected && (
                    <div className="mt-3 border-t border-white/10 pt-3">
                      <p className="text-xs leading-relaxed text-[#8899AA]" style={{ fontFamily: "Georgia, serif" }}>
                        {evidence.description}
                      </p>
                      <div className="mt-2 text-[9px] uppercase tracking-wider text-[#D4A843]">
                        Implicates: {evidence.implicates === "none" ? "Unknown" : evidence.implicates}
                        {evidence.is_red_herring ? " (unverified)" : ""}
                      </div>
                    </div>
                  )}
                </motion.button>
              );
            })}
          </div>
        )}

        {missingCount > 0 && (
          <div className="mt-6 text-[10px] uppercase tracking-[3px] text-[#445566]">
            {missingCount} clues still undiscovered
          </div>
        )}
      </div>

      {discoveredCards.length >= Math.min(3, activeSlot.evidence.length) && (
        <motion.div
          className="border-t border-white/5 px-5 py-3"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          <button
            onClick={() => goTo("accusation")}
            className="w-full py-3 text-xs uppercase tracking-[3px]"
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
