"use client";

import { motion } from "framer-motion";
import { useEffect } from "react";
import { useGameStore } from "@/lib/store";

export default function VerdictScreen() {
  const { accusation, activeSlot, resetGame, goTo } = useGameStore();

  useEffect(() => {
    if (!accusation || !activeSlot) {
      goTo("intro");
    }
  }, [accusation, activeSlot, goTo]);

  if (!accusation || !activeSlot) {
    return null;
  }

  const accused =
    activeSlot.suspects.find((suspect) => suspect.character_id === accusation.accused_id) ?? null;
  const killer =
    activeSlot.suspects.find((suspect) => suspect.character_id === accusation.killer_id) ?? null;

  return (
    <motion.div
      className="flex h-full flex-col gap-5 overflow-y-auto px-6 py-5"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 1.0, delay: 0.2 }}
    >
      <motion.div
        className="border-b border-white/5 py-6 text-center"
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
      >
        <div className="mb-3 text-[10px] uppercase tracking-[6px] text-[#445566]">The Verdict</div>
        <div
          className="mb-3 text-4xl font-bold"
          style={{
            color: accusation.correct ? "#4CAF50" : "#f44336",
            fontFamily: "Georgia, serif",
          }}
        >
          {accusation.correct ? "Case Closed." : "Wrong Accusation."}
        </div>
        <div className="text-sm italic text-[#8899AA]" style={{ fontFamily: "Georgia, serif" }}>
          {accusation.correct
            ? `${accused?.name ?? accusation.accused_name} was the killer.`
            : `${accused?.name ?? accusation.accused_name} was not the killer.`}
        </div>
      </motion.div>

      {!accusation.correct && (
        <motion.div
          className="border border-[#3A2020] p-5"
          style={{ background: "rgba(244,67,54,.04)" }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
        >
          <div className="mb-2 text-[9px] uppercase tracking-[3px] text-[#f44336]">The Real Killer</div>
          <div className="text-sm font-semibold text-[#E8E0D0]" style={{ fontFamily: "Georgia, serif" }}>
            {killer?.name ?? accusation.killer_name}
          </div>
        </motion.div>
      )}

      <motion.div
        className="border border-[#1E2A38] p-5"
        style={{ background: "rgba(255,255,255,.015)" }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.65 }}
      >
        <div className="mb-3 text-[9px] uppercase tracking-[3px] text-[#334455]">Summary</div>
        <p className="text-xs leading-relaxed text-[#8899AA]" style={{ fontFamily: "Georgia, serif" }}>
          {accusation.verdict_summary}
        </p>
      </motion.div>

      {accusation.missed_clues.length > 0 && (
        <motion.div
          className="border border-[#1E2A38] p-5"
          style={{ background: "rgba(255,255,255,.01)" }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8 }}
        >
          <div className="mb-2 text-[9px] uppercase tracking-[3px] text-[#334455]">Missed Clues</div>
          <ul className="space-y-1">
            {accusation.missed_clues.map((clue, index) => (
              <li key={`${clue}-${index}`} className="flex gap-2 text-[10px] leading-relaxed text-[#667788]">
                <span className="text-[#334455]">•</span>
                <span style={{ fontFamily: "Georgia, serif" }}>{clue}</span>
              </li>
            ))}
          </ul>
        </motion.div>
      )}

      {accusation.solve_time_seconds !== null && (
        <motion.div
          className="text-center text-[10px] uppercase tracking-[3px] text-[#445566]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.95 }}
        >
          Solve Time: {accusation.solve_time_seconds}s
        </motion.div>
      )}

      <motion.div
        className="mt-auto flex gap-3 pt-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.1 }}
      >
        <button
          onClick={resetGame}
          className="flex-1 py-3 text-xs uppercase tracking-[3px]"
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
