"use client";

import { useEffect } from "react";
import { motion } from "framer-motion";
import { useGameStore } from "@/lib/store";

export default function IntroScreen() {
  const {
    loadingLanding,
    landingError,
    startingSession,
    startError,
    dailyKeywords,
    selectedKeywordIds,
    initializeLanding,
    toggleKeywordSelection,
    clearKeywordSelection,
    startSessionFromKeywords,
  } = useGameStore();

  useEffect(() => {
    void initializeLanding();
  }, [initializeLanding]);

  return (
    <motion.div
      className="flex h-full flex-col items-center justify-center gap-8 px-6 py-10"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.6 }}
    >
      <div className="max-w-2xl text-center">
        <div className="mb-3 text-[10px] uppercase tracking-[5px] text-[#D4A843]">
          Daily Mystery Match
        </div>
        <h1
          className="text-4xl font-bold text-[#E8E0D0] sm:text-5xl"
          style={{ fontFamily: "Georgia, serif" }}
        >
          CaseBreaker AI
        </h1>
        <p className="mt-4 text-sm leading-relaxed text-[#77889A]" style={{ fontFamily: "Georgia, serif" }}>
          Pick up to four keyword chips. We will match your choices to today&apos;s best story and start your case.
        </p>
      </div>

      <div className="w-full max-w-3xl rounded-lg border border-white/10 bg-white/[0.02] p-5">
        <div className="mb-4 flex items-center justify-between">
          <div className="text-[10px] uppercase tracking-[3px] text-[#D4A843]">Choose Keywords</div>
          <div className="text-[10px] text-[#445566]">{selectedKeywordIds.length} / 4 selected</div>
        </div>

        {loadingLanding ? (
          <div className="py-8 text-center text-xs text-[#667788]">Loading today&apos;s keywords...</div>
        ) : dailyKeywords.length === 0 ? (
          <div className="py-8 text-center text-xs text-[#667788]">
            No daily keywords are available yet. Generate today&apos;s slots in the backend first.
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {dailyKeywords.map((keyword) => {
              const selected = selectedKeywordIds.includes(keyword.keyword_id);
              const atLimit = selectedKeywordIds.length >= 4 && !selected;
              return (
                <button
                  key={keyword.keyword_id}
                  onClick={() => toggleKeywordSelection(keyword.keyword_id)}
                  disabled={atLimit || startingSession}
                  className="rounded-full border px-3 py-1.5 text-xs transition-all disabled:cursor-not-allowed disabled:opacity-45"
                  style={{
                    borderColor: selected ? "rgba(212,168,67,.55)" : "rgba(255,255,255,.14)",
                    background: selected ? "rgba(212,168,67,.14)" : "rgba(255,255,255,.03)",
                    color: selected ? "#D4A843" : "#C8D0DC",
                  }}
                >
                  {keyword.label}
                </button>
              );
            })}
          </div>
        )}

        {(landingError || startError) && (
          <div className="mt-4 rounded border border-[#6A2B2B] bg-[#2A1111] px-3 py-2 text-xs text-[#E89A9A]">
            {startError ?? landingError}
          </div>
        )}
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={clearKeywordSelection}
          disabled={selectedKeywordIds.length === 0 || startingSession}
          className="px-4 py-2 text-[10px] uppercase tracking-[3px] text-[#667788] transition-colors hover:text-[#C8D0DC] disabled:opacity-40"
        >
          Clear
        </button>
        <motion.button
          onClick={() => {
            void startSessionFromKeywords();
          }}
          disabled={selectedKeywordIds.length === 0 || startingSession || loadingLanding}
          className="px-8 py-3 text-xs uppercase tracking-[3px] font-semibold transition-all disabled:opacity-35"
          style={{
            background: "rgba(212,168,67,.12)",
            border: "1px solid rgba(212,168,67,.45)",
            color: "#D4A843",
            fontFamily: "Georgia, serif",
          }}
          whileHover={{ background: "rgba(212,168,67,.18)" }}
          whileTap={{ scale: 0.98 }}
        >
          {startingSession ? "Matching Story..." : "Start Investigation"}
        </motion.button>
      </div>
    </motion.div>
  );
}
