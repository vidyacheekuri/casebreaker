"use client";

import { motion } from "framer-motion";
import { useGameStore } from "@/lib/store";

export default function IntroScreen() {
  const goTo = useGameStore((s) => s.goTo);

  return (
    <motion.div
      className="flex flex-col items-center justify-center h-full gap-10 px-8 text-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 1.2 }}
    >
      <div className="flex flex-col items-center gap-4">
        <div className="text-[10px] tracking-[6px] uppercase text-[#D4A843] mb-2">
          An Interactive Murder Mystery
        </div>
        <h1
          className="text-5xl font-bold tracking-tight text-[#E8E0D0]"
          style={{ fontFamily: "Georgia, serif", letterSpacing: "-0.02em" }}
        >
          CaseBreaker AI
        </h1>
        <div
          className="text-xl text-[#8899AA] italic mt-1"
          style={{ fontFamily: "Georgia, serif" }}
        >
          The Harlow Manor Affair
        </div>
      </div>

      <div
        className="max-w-md text-sm leading-relaxed text-[#667788]"
        style={{ fontFamily: "Georgia, serif" }}
      >
        Harlow Manor, Devon. October 1923.
        <br />
        Edmund Harlow has been found dead in his library — poisoned.
        <br />
        Three people were in the house that night.
        <br />
        One of them is a murderer.
      </div>

      <div className="flex flex-col items-center gap-4">
        <motion.button
          onClick={() => goTo("cinematic")}
          className="px-10 py-4 text-sm tracking-[3px] uppercase font-semibold transition-all"
          style={{
            background: "rgba(212,168,67,.1)",
            border: "1px solid rgba(212,168,67,.4)",
            color: "#D4A843",
            fontFamily: "Georgia, serif",
          }}
          whileHover={{ background: "rgba(212,168,67,.18)", scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
        >
          Begin Investigation
        </motion.button>
        <div className="text-[10px] text-[#334455] tracking-wider">
          Powered by Claude AI · ElevenLabs Voice
        </div>
      </div>

      <div
        className="absolute bottom-8 text-[10px] text-[#2A3344] tracking-[3px] uppercase"
        style={{ fontFamily: "Georgia, serif" }}
      >
        Harlow Manor · Devon · MCMXXIII
      </div>
    </motion.div>
  );
}
