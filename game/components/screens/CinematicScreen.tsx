"use client";

import { motion } from "framer-motion";
import { useGameStore } from "@/lib/store";
import { HARLOW_MANOR } from "@/lib/cases/harlow-manor";

const CASE_LINES = [
  "HARLOW MANOR TRAGEDY",
  "INDUSTRIALIST FOUND DEAD",
  "Edmund Harlow, 62, discovered in his library at Harlow Manor, Devon.",
  "Cause of death: Strychnine poisoning.",
  "Time of death: Between 9 PM and 10:30 PM, October 14th, 1923.",
  "Three persons of interest were present that evening.",
  "The inquest has been suspended pending further inquiry.",
  "You have been called in. The case is yours.",
];

export default function CinematicScreen() {
  const goTo = useGameStore((s) => s.goTo);

  return (
    <motion.div
      className="flex flex-col items-center justify-center h-full px-8 gap-8"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.8 }}
    >
      {/* Newspaper — 3D fold reveal */}
      <div style={{ perspective: "900px", perspectiveOrigin: "50% 40%", width: "100%", maxWidth: 576 }}>
      <motion.div
        className="max-w-xl w-full border border-[#3A3020] p-8 relative"
        style={{
          background: "linear-gradient(160deg, rgba(240,232,200,.07) 0%, rgba(220,210,170,.04) 100%)",
          fontFamily: "Georgia, serif",
          transformOrigin: "center bottom",
          boxShadow: "0 8px 32px rgba(0,0,0,.5), inset 0 1px 0 rgba(255,248,200,.04)",
        }}
        initial={{ rotateX: -82, opacity: 0 }}
        animate={{ rotateX: 0, opacity: 1 }}
        transition={{ duration: 1.0, ease: [0.22, 0.61, 0.36, 1], delay: 0.15 }}
      >
        {/* Masthead */}
        <div className="text-center mb-4 pb-4 border-b border-[#2A3344]">
          <div className="text-[8px] tracking-[5px] uppercase text-[#445566] mb-2">
            The Devon Morning Chronicle
          </div>
          <div className="text-[8px] text-[#334455]">
            Tuesday, October 15th, 1923 · Price One Penny
          </div>
        </div>

        {/* Headlines */}
        <div className="space-y-2 text-center mb-4">
          {CASE_LINES.slice(0, 2).map((line, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 + i * 0.3 }}
              className={i === 0 ? "text-xl font-bold text-[#D4A843] tracking-wide uppercase" : "text-sm font-semibold text-[#C8D0DC] uppercase tracking-wider"}
            >
              {line}
            </motion.div>
          ))}
        </div>

        {/* Rule */}
        <div className="border-t border-[#2A3344] my-3" />

        {/* Body */}
        <div className="space-y-2">
          {CASE_LINES.slice(2).map((line, i) => (
            <motion.p
              key={i}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1.1 + i * 0.25 }}
              className="text-xs text-[#8899AA] leading-relaxed"
            >
              {line}
            </motion.p>
          ))}
        </div>
      </motion.div>
      </div>

      {/* Suspects brief */}
      <motion.div
        className="max-w-xl w-full"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 3.5 }}
      >
        <div className="text-[10px] tracking-[4px] uppercase text-[#445566] mb-3 text-center">
          Persons of Interest
        </div>
        <div className="grid grid-cols-3 gap-3">
          {HARLOW_MANOR.suspects.map((s) => (
            <div
              key={s.id}
              className="border border-[#1E2A38] p-3 text-center"
              style={{ background: "rgba(255,255,255,.02)" }}
            >
              <div className="text-[10px] text-[#D4A843] tracking-wider uppercase mb-1">{s.name}</div>
              <div className="text-[9px] text-[#445566]">{s.occupation}</div>
            </div>
          ))}
        </div>
      </motion.div>

      <motion.button
        onClick={() => goTo("manor")}
        className="px-8 py-3 text-xs tracking-[3px] uppercase transition-all"
        style={{
          background: "rgba(212,168,67,.08)",
          border: "1px solid rgba(212,168,67,.3)",
          color: "#D4A843",
          fontFamily: "Georgia, serif",
        }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 4 }}
        whileHover={{ background: "rgba(212,168,67,.15)" }}
      >
        Enter the Manor →
      </motion.button>
    </motion.div>
  );
}
