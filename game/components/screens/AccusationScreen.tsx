"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useGameStore } from "@/lib/store";
import EvidenceImage from "@/components/ui/EvidenceImage";

export default function AccusationScreen() {
  const { activeSlot, discoveredEvidence, goTo, submitAccusation, suspectStress } = useGameStore();

  const [accusedId, setAccusedId] = useState<string | null>(null);
  const [reasoning, setReasoning] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!activeSlot) {
      goTo("intro");
    }
  }, [activeSlot, goTo]);

  if (!activeSlot) {
    return null;
  }

  const discoveredItems = discoveredEvidence
    .map((id) => activeSlot.evidence.find((evidence) => evidence.evidence_id === id))
    .filter((item): item is NonNullable<typeof item> => Boolean(item));

  const accusedName =
    accusedId
      ? activeSlot.suspects.find((suspect) => suspect.character_id === accusedId)?.name ?? "Selected suspect"
      : null;

  async function confirmAccusation(): Promise<void> {
    if (!accusedId) {
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await submitAccusation(accusedId, reasoning.trim() || "No written reasoning provided.");
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Could not submit accusation.";
      setError(message);
      setSubmitting(false);
      setConfirming(false);
    }
  }

  return (
    <motion.div
      className="flex h-full flex-col gap-5 overflow-y-auto px-6 py-5"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.35 }}
    >
      <div className="flex items-center justify-between">
        <button
          onClick={() => goTo("manor")}
          className="text-label uppercase tracking-wider text-[#445566] transition-colors hover:text-[#C8D0DC]"
        >
          ← Back
        </button>
        <div className="text-h1 uppercase tracking-[4px] text-[#D4A843]">Final Accusation</div>
        <div className="w-16" />
      </div>

      <div className="text-center text-body italic leading-relaxed text-[#667788]" style={{ fontFamily: "Georgia, serif" }}>
        You have gathered enough clues. Name the killer and explain your reasoning.
      </div>

      <div className="border border-[#1E2A38] p-4" style={{ background: "rgba(255,255,255,.01)" }}>
        <div className="mb-2 text-detail uppercase tracking-[3px] text-[#334455]">Evidence In Hand</div>
        {discoveredItems.length === 0 ? (
          <div className="text-caption italic text-[#334455]">No evidence collected yet.</div>
        ) : (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {discoveredItems.map((item) => (
              <div
                key={item.evidence_id}
                className="flex items-center gap-3 rounded border p-2"
                style={{
                  background: "rgba(212,168,67,.08)",
                  border: "1px solid rgba(212,168,67,.2)",
                  color: "#D4A843",
                }}
              >
                <EvidenceImage evidence={item} size="compact" />
                <div className="min-w-0">
                  <div className="truncate text-label font-semibold text-[#D4A843]">
                    {item.name}
                  </div>
                  <div className="mt-0.5 truncate text-detail text-[#667788]">
                    {item.location}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <div className="mb-3 text-detail uppercase tracking-[3px] text-[#334455]">Who is the killer?</div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {activeSlot.suspects.map((suspect) => {
            const selected = accusedId === suspect.character_id;
            const stress = suspectStress[suspect.character_id] ?? 0;
            return (
              <motion.button
                key={suspect.character_id}
                onClick={() => setAccusedId(suspect.character_id)}
                className="border p-4 text-left"
                style={{
                  background: selected ? "rgba(212,168,67,.1)" : "rgba(255,255,255,.02)",
                  borderColor: selected ? "rgba(212,168,67,.5)" : "rgba(255,255,255,.07)",
                }}
                whileHover={{ borderColor: "rgba(212,168,67,.32)" }}
              >
                <div className="text-h2 font-semibold text-[#C8D0DC]">{suspect.name}</div>
                <div className="mt-0.5 text-detail text-[#445566]">{suspect.occupation}</div>
                <div className="mt-1 text-detail italic text-[#334455]">{suspect.relationship_to_victim}</div>
                <div className="mt-3">
                  <div className="mb-1 flex items-center justify-between text-detail uppercase tracking-[1.6px] text-[#334455]">
                    <span>Stress</span>
                    <span>{Math.round(stress)}%</span>
                  </div>
                  <div className="h-1 w-full overflow-hidden rounded-full bg-white/5">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${stress}%`,
                        background: stress >= 70 ? "#f44336" : stress >= 40 ? "#FF9800" : "#4CAF50",
                      }}
                    />
                  </div>
                </div>
              </motion.button>
            );
          })}
        </div>
      </div>

      <div>
        <div className="mb-2 text-detail uppercase tracking-[3px] text-[#334455]">Your Reasoning</div>
        <textarea
          value={reasoning}
          onChange={(event) => setReasoning(event.target.value)}
          placeholder="Explain your deduction. Which clues support your accusation?"
          className="w-full resize-none rounded-md border bg-transparent px-4 py-3 text-body outline-none placeholder:text-[#334455]"
          style={{
            borderColor: "rgba(255,255,255,.1)",
            color: "#C8D0DC",
            fontFamily: "Georgia, serif",
            minHeight: 110,
          }}
          rows={4}
        />
      </div>

      {error && (
        <div className="rounded border border-[#6A2B2B] bg-[#2A1111] px-3 py-2 text-caption text-[#E89A9A]">{error}</div>
      )}

      <motion.button
        onClick={() => setConfirming(true)}
        disabled={!accusedId || submitting}
        className="py-4 text-caption font-semibold uppercase tracking-[3px] transition-all disabled:opacity-35"
        style={{
          background: "rgba(212,168,67,.1)",
          border: "1px solid rgba(212,168,67,.4)",
          color: "#D4A843",
          fontFamily: "Georgia, serif",
        }}
        whileHover={{ background: "rgba(212,168,67,.18)" }}
      >
        {accusedName ? `Accuse ${accusedName} →` : "Select a Suspect"}
      </motion.button>

      {confirming && accusedId && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          style={{ background: "rgba(0,0,0,.75)", backdropFilter: "blur(4px)" }}
        >
          <motion.div
            className="mx-4 w-full max-w-sm border p-8"
            style={{ background: "#070E1A", borderColor: "rgba(212,168,67,.3)", fontFamily: "Georgia, serif" }}
            initial={{ scale: 0.92, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
          >
            <div className="mb-4 text-center text-h2 uppercase tracking-[4px] text-[#D4A843]">Confirm Accusation</div>
            <p className="mb-6 text-center text-body leading-relaxed text-[#C8D0DC]">
              You are about to accuse <strong className="text-[#D4A843]">{accusedName}</strong>. This finalizes this run.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirming(false)}
                disabled={submitting}
                className="flex-1 border border-white/10 py-2.5 text-caption uppercase tracking-[2px] text-[#445566] transition-colors hover:text-[#C8D0DC]"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  void confirmAccusation();
                }}
                disabled={submitting}
                className="flex-1 py-2.5 text-caption font-semibold uppercase tracking-[2px] transition-all"
                style={{
                  background: "rgba(212,168,67,.15)",
                  border: "1px solid rgba(212,168,67,.5)",
                  color: "#D4A843",
                }}
              >
                {submitting ? "Submitting..." : "Confirm"}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </motion.div>
  );
}
