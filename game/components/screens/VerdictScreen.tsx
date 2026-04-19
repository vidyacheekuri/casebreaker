"use client";

import { motion } from "framer-motion";
import { useGameStore } from "@/lib/store";
import { HARLOW_MANOR, getSuspect } from "@/lib/cases/harlow-manor";

export default function VerdictScreen() {
  const { accusation, discoveredEvidence, resetGame, goTo } = useGameStore();

  if (!accusation) {
    goTo("manor");
    return null;
  }

  const { correct, accusedId, reasoning } = accusation;
  const accused = getSuspect(accusedId);
  const trueKiller = getSuspect(HARLOW_MANOR.killerId);
  const { verdict } = HARLOW_MANOR;

  const missedEvidence = HARLOW_MANOR.evidence
    .filter((e) => !e.isRedHerring && !discoveredEvidence.includes(e.id))
    .map((e) => e.name);

  return (
    <motion.div
      className="flex flex-col h-full px-6 py-5 gap-5 overflow-y-auto"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 1.5, delay: 0.5 }}
    >
      {/* Verdict header */}
      <motion.div
        className="text-center py-6 border-b border-white/5"
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.8 }}
      >
        <div className="text-[10px] tracking-[6px] uppercase text-[#445566] mb-3">
          The Verdict
        </div>
        <div
          className="text-4xl font-bold mb-3"
          style={{
            color: correct ? "#4CAF50" : "#f44336",
            fontFamily: "Georgia, serif",
            textShadow: correct ? "0 0 30px rgba(76,175,80,.3)" : "0 0 30px rgba(244,67,54,.3)",
          }}
        >
          {correct ? "Case Closed." : "Wrong Accusation."}
        </div>
        <div
          className="text-sm text-[#8899AA] italic"
          style={{ fontFamily: "Georgia, serif" }}
        >
          {correct
            ? `${accused.name} has been arrested for the murder of Edmund Harlow.`
            : `${accused.name} is innocent. The real killer walks free.`}
        </div>
      </motion.div>

      {/* True killer reveal (on wrong) */}
      {!correct && (
        <motion.div
          className="border border-[#3A2020] p-5"
          style={{ background: "rgba(244,67,54,.04)" }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.2 }}
        >
          <div className="text-[9px] tracking-[3px] uppercase text-[#f44336] mb-2">The True Killer</div>
          <div className="text-sm font-semibold text-[#E8E0D0]" style={{ fontFamily: "Georgia, serif" }}>
            {trueKiller.name}
          </div>
          <div className="text-xs text-[#8899AA] mt-1 leading-relaxed" style={{ fontFamily: "Georgia, serif" }}>
            {HARLOW_MANOR.motive}
          </div>
        </motion.div>
      )}

      {/* True sequence */}
      <motion.div
        className="border border-[#1E2A38] p-5"
        style={{ background: "rgba(255,255,255,.015)" }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.5 }}
      >
        <div className="text-[9px] tracking-[3px] uppercase text-[#334455] mb-3">What Actually Happened</div>
        <p
          className="text-xs text-[#8899AA] leading-relaxed"
          style={{ fontFamily: "Georgia, serif" }}
        >
          {verdict.explanation}
        </p>
        <div className="mt-3 pt-3 border-t border-white/5">
          <div className="text-[9px] text-[#445566] tracking-wider mb-1">Sequence of Events:</div>
          <p className="text-[10px] text-[#667788] italic leading-relaxed" style={{ fontFamily: "Georgia, serif" }}>
            {verdict.trueSequence}
          </p>
        </div>
      </motion.div>

      {/* Your reasoning */}
      <motion.div
        className="border border-[#1E2A38] p-5"
        style={{ background: "rgba(255,255,255,.01)" }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.8 }}
      >
        <div className="text-[9px] tracking-[3px] uppercase text-[#334455] mb-2">Your Deduction</div>
        <p className="text-xs text-[#667788] leading-relaxed italic" style={{ fontFamily: "Georgia, serif" }}>
          "{reasoning}"
        </p>
      </motion.div>

      {/* Missed evidence */}
      {missedEvidence.length > 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 2.1 }}
        >
          <div className="text-[9px] tracking-[3px] uppercase text-[#334455] mb-2">Evidence You Missed</div>
          <div className="flex flex-wrap gap-2">
            {missedEvidence.map((name) => (
              <span
                key={name}
                className="text-[10px] px-2 py-0.5 rounded"
                style={{ background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.07)", color: "#667788" }}
              >
                {name}
              </span>
            ))}
          </div>
        </motion.div>
      )}

      {/* Missed clues */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 2.3 }}
      >
        <div className="text-[9px] tracking-[3px] uppercase text-[#334455] mb-2">Key Deductions</div>
        <ul className="space-y-1">
          {verdict.missedClues.map((clue, i) => (
            <li key={i} className="text-[10px] text-[#556677] leading-relaxed flex gap-2">
              <span className="text-[#334455] flex-shrink-0">·</span>
              <span style={{ fontFamily: "Georgia, serif" }}>{clue}</span>
            </li>
          ))}
        </ul>
      </motion.div>

      {/* Actions */}
      <motion.div
        className="flex gap-3 mt-auto pt-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 2.6 }}
      >
        <button
          onClick={resetGame}
          className="flex-1 py-3 text-xs tracking-[3px] uppercase transition-all"
          style={{
            background: "rgba(212,168,67,.08)",
            border: "1px solid rgba(212,168,67,.3)",
            color: "#D4A843",
            fontFamily: "Georgia, serif",
          }}
        >
          Play Again
        </button>
      </motion.div>
    </motion.div>
  );
}
