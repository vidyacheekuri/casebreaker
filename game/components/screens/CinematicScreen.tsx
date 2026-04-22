"use client";

import { motion } from "framer-motion";
import { useEffect } from "react";
import { useGameStore } from "@/lib/store";

export default function CinematicScreen() {
  const { goTo, activeSlot } = useGameStore();

  useEffect(() => {
    if (!activeSlot) {
      goTo("intro");
    }
  }, [activeSlot, goTo]);

  if (!activeSlot) {
    return null;
  }

  const victim = activeSlot.victim;

  return (
    <motion.div
      className="flex h-full flex-col items-center justify-center gap-8 px-8"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.8 }}
    >
      <div style={{ perspective: "900px", width: "100%", maxWidth: 620 }}>
        <motion.div
          className="w-full border border-[#3A3020] p-8"
          style={{
            background: "linear-gradient(160deg, rgba(240,232,200,.07) 0%, rgba(220,210,170,.04) 100%)",
            boxShadow: "0 8px 32px rgba(0,0,0,.5), inset 0 1px 0 rgba(255,248,200,.04)",
            transformOrigin: "center bottom",
            fontFamily: "Georgia, serif",
          }}
          initial={{ rotateX: -82, opacity: 0 }}
          animate={{ rotateX: 0, opacity: 1 }}
          transition={{ duration: 0.95, ease: [0.22, 0.61, 0.36, 1], delay: 0.15 }}
        >
          <div className="mb-4 border-b border-[#2A3344] pb-4 text-center">
            <div className="mb-2 text-[8px] uppercase tracking-[5px] text-[#445566]">Case File Opened</div>
            <div className="text-[8px] text-[#334455]">Case Date: {activeSlot.case_date}</div>
          </div>

          <div className="mb-4 space-y-2 text-center">
            <div className="text-xl font-bold uppercase tracking-wide text-[#D4A843]">{activeSlot.title}</div>
            <div className="text-sm font-semibold uppercase tracking-wider text-[#C8D0DC]">
              Victim: {victim.name}
            </div>
          </div>

          <div className="my-3 border-t border-[#2A3344]" />

          <p className="text-xs leading-relaxed text-[#8899AA]">{activeSlot.summary}</p>

          <div className="mt-4 grid grid-cols-2 gap-2 text-[10px] text-[#667788]">
            <div>Setting: {activeSlot.setting}</div>
            <div>Mood: {activeSlot.mood}</div>
            <div>Cause of Death: {victim.cause_of_death}</div>
            <div>Occupation: {victim.occupation}</div>
          </div>
        </motion.div>
      </div>

      <motion.div
        className="w-full max-w-xl"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1.1 }}
      >
        <div className="mb-3 text-center text-[10px] uppercase tracking-[4px] text-[#445566]">Persons of Interest</div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {activeSlot.suspects.map((suspect) => (
            <div
              key={suspect.character_id}
              className="border border-[#1E2A38] p-3 text-center"
              style={{ background: "rgba(255,255,255,.02)" }}
            >
              <div className="text-[10px] uppercase tracking-wider text-[#D4A843]">{suspect.name}</div>
              <div className="mt-1 text-[9px] text-[#556677]">{suspect.occupation}</div>
            </div>
          ))}
        </div>
      </motion.div>

      <motion.button
        onClick={() => goTo("manor")}
        className="px-8 py-3 text-xs uppercase tracking-[3px] transition-all"
        style={{
          background: "rgba(212,168,67,.08)",
          border: "1px solid rgba(212,168,67,.3)",
          color: "#D4A843",
          fontFamily: "Georgia, serif",
        }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.5 }}
        whileHover={{ background: "rgba(212,168,67,.15)" }}
      >
        Enter Investigation →
      </motion.button>
    </motion.div>
  );
}
