"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { useGameStore } from "@/lib/store";
import { HARLOW_MANOR, getSuspect } from "@/lib/cases/harlow-manor";
import type { SuspectId } from "@/lib/cases/harlow-manor";

export default function AccusationScreen() {
  const { goTo, submitAccusation, discoveredEvidence } = useGameStore();
  const [accused, setAccused] = useState<SuspectId | null>(null);
  const [reasoning, setReasoning] = useState("");
  const [confirming, setConfirming] = useState(false);

  function handleAccuse() {
    if (!accused || !reasoning.trim()) return;
    setConfirming(true);
  }

  function confirmAccusation() {
    if (!accused) return;
    submitAccusation(accused, reasoning);
    goTo("verdict");
  }

  return (
    <motion.div
      className="flex flex-col h-full px-6 py-5 gap-5 overflow-y-auto"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}
    >
      <div className="flex items-center justify-between">
        <button
          onClick={() => goTo("manor")}
          className="text-[10px] tracking-wider uppercase text-[#445566] hover:text-[#C8D0DC] transition-colors"
        >
          ← Back
        </button>
        <div className="text-[10px] tracking-[4px] uppercase text-[#D4A843]">Final Accusation</div>
        <div className="w-16" />
      </div>

      <div
        className="text-sm text-[#667788] leading-relaxed italic text-center"
        style={{ fontFamily: "Georgia, serif" }}
      >
        You have gathered the evidence. Now name the killer.
      </div>

      {/* Evidence summary */}
      <div className="border border-[#1E2A38] p-4" style={{ background: "rgba(255,255,255,.01)" }}>
        <div className="text-[9px] tracking-[3px] uppercase text-[#334455] mb-2">Evidence in Hand</div>
        {discoveredEvidence.length === 0 ? (
          <div className="text-xs text-[#334455] italic">No evidence collected.</div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {discoveredEvidence.map((id) => {
              const ev = HARLOW_MANOR.evidence.find((e) => e.id === id)!;
              return (
                <span
                  key={id}
                  className="text-[10px] px-2 py-0.5 rounded"
                  style={{ background: "rgba(212,168,67,.08)", border: "1px solid rgba(212,168,67,.2)", color: "#D4A843" }}
                >
                  {ev.name}
                </span>
              );
            })}
          </div>
        )}
      </div>

      {/* Suspect selection */}
      <div>
        <div className="text-[9px] tracking-[3px] uppercase text-[#334455] mb-3">Who killed Edmund Harlow?</div>
        <div className="grid grid-cols-3 gap-2">
          {HARLOW_MANOR.suspects.map((s) => (
            <motion.button
              key={s.id}
              onClick={() => setAccused(s.id)}
              className="p-4 border text-left transition-all"
              style={{
                background: accused === s.id ? "rgba(212,168,67,.1)" : "rgba(255,255,255,.02)",
                borderColor: accused === s.id ? "rgba(212,168,67,.5)" : "rgba(255,255,255,.07)",
              }}
              whileHover={{ borderColor: "rgba(212,168,67,.3)" }}
            >
              <div
                className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold mb-2"
                style={{
                  background: accused === s.id ? "rgba(212,168,67,.15)" : "rgba(255,255,255,.04)",
                  border: `1px solid ${accused === s.id ? "rgba(212,168,67,.4)" : "rgba(255,255,255,.07)"}`,
                  color: accused === s.id ? "#D4A843" : "#8899AA",
                }}
              >
                {s.portrait}
              </div>
              <div className="text-xs font-semibold text-[#C8D0DC]">{s.name}</div>
              <div className="text-[9px] text-[#445566] mt-0.5">{s.occupation}</div>
            </motion.button>
          ))}
        </div>
      </div>

      {/* Reasoning */}
      <div>
        <div className="text-[9px] tracking-[3px] uppercase text-[#334455] mb-2">
          Your Reasoning
        </div>
        <textarea
          value={reasoning}
          onChange={(e) => setReasoning(e.target.value)}
          placeholder="Explain your deduction. What evidence points to them? What was their motive? What does their alibi fail to account for?"
          className="w-full bg-transparent border rounded-md px-4 py-3 text-xs outline-none resize-none transition-colors placeholder:text-[#334455]"
          style={{
            borderColor: "rgba(255,255,255,.1)",
            color: "#C8D0DC",
            fontFamily: "Georgia, serif",
            minHeight: 100,
          }}
          rows={4}
        />
      </div>

      <motion.button
        onClick={handleAccuse}
        disabled={!accused || !reasoning.trim()}
        className="py-4 text-sm tracking-[3px] uppercase font-semibold transition-all disabled:opacity-30"
        style={{
          background: "rgba(212,168,67,.1)",
          border: "1px solid rgba(212,168,67,.4)",
          color: "#D4A843",
          fontFamily: "Georgia, serif",
        }}
        whileHover={{ background: "rgba(212,168,67,.18)" }}
      >
        {accused ? `Accuse ${getSuspect(accused).name.split(" ").slice(-1)[0]} →` : "Select a Suspect"}
      </motion.button>

      {/* Confirmation modal */}
      {confirming && accused && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          style={{ background: "rgba(0,0,0,.75)", backdropFilter: "blur(4px)" }}
        >
          <motion.div
            className="max-w-sm w-full mx-4 p-8 border"
            style={{
              background: "#070E1A",
              borderColor: "rgba(212,168,67,.3)",
              fontFamily: "Georgia, serif",
            }}
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
          >
            <div className="text-[10px] tracking-[4px] uppercase text-[#D4A843] mb-4 text-center">
              Final Verdict
            </div>
            <p className="text-sm text-[#C8D0DC] leading-relaxed text-center mb-6">
              You are about to formally accuse{" "}
              <strong className="text-[#D4A843]">{getSuspect(accused).name}</strong> of the murder
              of Edmund Harlow. This cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirming(false)}
                className="flex-1 py-2.5 text-xs tracking-[2px] uppercase text-[#445566] border border-white/10 hover:text-[#C8D0DC] transition-colors"
              >
                Wait
              </button>
              <button
                onClick={confirmAccusation}
                className="flex-1 py-2.5 text-xs tracking-[2px] uppercase font-semibold transition-all"
                style={{
                  background: "rgba(212,168,67,.15)",
                  border: "1px solid rgba(212,168,67,.5)",
                  color: "#D4A843",
                }}
              >
                Accuse →
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </motion.div>
  );
}
