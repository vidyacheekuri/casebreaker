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
  const timeOfDeath = victim.time_of_death?.trim() || "Not yet confirmed";
  const stakes =
    activeSlot.stakes?.trim() ||
    "Uncover the truth before the suspects' stories drift further apart.";
  const trimText = (value: string | undefined, maxLength: number) => {
    if (!value) {
      return "Unknown";
    }
    return value.length > maxLength ? `${value.slice(0, maxLength).trim()}...` : value;
  };

  return (
    <motion.div
      className="relative flex h-full w-full items-center justify-center overflow-hidden px-6 py-3"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.45 }}
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_30%,rgba(212,168,67,.07),transparent_36%),linear-gradient(180deg,#070E1A,#03070D)]" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-black/60 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/70 to-transparent" />

      <button
        type="button"
        onClick={() => goTo("intro")}
        className="absolute left-6 top-5 z-20 text-[10px] uppercase tracking-wider text-[#445566] transition-colors hover:text-[#C8D0DC]"
      >
        ← Back to Leads
      </button>

      <motion.div
        className="relative z-10 w-full max-w-5xl space-y-3"
        initial={{ opacity: 0, y: 16, scale: 0.985 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.55, ease: [0.22, 0.61, 0.36, 1] }}
      >
        <div className="text-center">
          <div className="mb-1 text-[10px] uppercase tracking-[5px] text-[#D4A843]">Case File Opened</div>
          <h1 className="text-[30px] font-bold uppercase leading-tight tracking-[5px] text-[#D4A843] sm:text-[38px]">
            {activeSlot.title}
          </h1>
        </div>

        <div className="grid gap-3 rounded-lg border border-[#3A3020] bg-black/20 p-4 shadow-[0_20px_60px_rgba(0,0,0,.45)] backdrop-blur-sm md:grid-cols-2">
          <section className="rounded-lg border border-[#D4A843]/30 bg-black/20 p-4">
            <div className="mb-1.5 text-[12px] font-bold uppercase tracking-[3px] text-[#D4A843]">The Victim</div>
            <div className="space-y-1.5">
              <div className="text-[26px] font-bold leading-tight text-[#E8E0D0]" style={{ fontFamily: "Georgia, serif" }}>
                {victim.name}
              </div>
              <div className="text-[15px] text-[#7B8FA3]">{victim.occupation}</div>
              <div className="mt-1.5 border-t border-white/5 pt-1.5 text-[14px] leading-snug text-[#8899AA]">
                <div><span className="text-[#D4A843]">Age:</span> {victim.age}</div>
                <div><span className="text-[#D4A843]">Status:</span> Found deceased</div>
                <div className="mt-1 text-[#D4A843]">{victim.cause_of_death}</div>
              </div>
            </div>
          </section>

          <section className="rounded-lg border border-[#D4A843]/30 bg-black/20 p-4">
            <div className="mb-1.5 text-[12px] font-bold uppercase tracking-[3px] text-[#D4A843]">Case Snapshot</div>
            <div className="space-y-0.5 text-[14px] leading-snug text-[#8899AA]">
              <div><span className="text-[#D4A843]">Location:</span> {activeSlot.setting}</div>
              <div><span className="text-[#D4A843]">Date:</span> {activeSlot.case_date}</div>
              <div><span className="text-[#D4A843]">Time of Death:</span> {timeOfDeath}</div>
              <div><span className="text-[#D4A843]">Mood:</span> {activeSlot.mood}</div>
              <div className="mt-1 border-t border-white/5 pt-1">
                <span className="text-[#D4A843]">Suspects:</span> {activeSlot.suspects.length} persons of interest
              </div>
            </div>
          </section>

          <section className="space-y-2 md:col-span-2">
            <div>
              <div className="text-[12px] font-bold uppercase tracking-[3px] text-[#D4A843]">The Scene</div>
              <p className="mt-1.5 line-clamp-2 text-[17px] leading-snug text-[#C8D0DC]" style={{ fontFamily: "Georgia, serif" }}>
              {activeSlot.summary}
              </p>
            </div>
            <div>
              <div className="text-[12px] font-bold uppercase tracking-[3px] text-[#D4A843]">What&apos;s at Stake</div>
              <p className="mt-1.5 line-clamp-2 text-[14px] italic leading-snug text-[#8899AA]">
                {stakes}
              </p>
            </div>
          </section>

          <section className="md:col-span-2">
            <div className="mb-2 text-[12px] font-bold uppercase tracking-[3px] text-[#D4A843]">Persons of Interest</div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {activeSlot.suspects.map((suspect) => (
                <div
                  key={suspect.character_id}
                  className="rounded-lg border border-white/10 bg-white/[0.025] p-2.5 transition-colors hover:border-[#D4A843]/40"
                >
                  <div className="text-[16px] font-semibold leading-tight text-[#E8E0D0]">{suspect.name}</div>
                  <div className="mt-0.5 text-[13px] leading-tight text-[#7B8FA3]">{suspect.occupation}</div>
                  <div className="mt-0.5 text-[11px] leading-tight text-[#556677]">
                    {trimText(suspect.relationship_to_victim, 45)}
                  </div>
                  <div className="mt-0.5 text-[10px] leading-tight text-[#445566]">
                    Motive: {trimText(suspect.motive, 30)}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>

        <div className="flex justify-center">
          <motion.button
            type="button"
            onClick={() => goTo("manor")}
            className="rounded-lg px-8 py-2.5 text-[13px] font-bold uppercase tracking-[3px] text-[#070E1A] transition-all"
            style={{
              background: "linear-gradient(90deg, #D4A843, #8B6914)",
              boxShadow: "0 0 24px rgba(212,168,67,.24)",
              fontFamily: "Georgia, serif",
            }}
            whileHover={{ y: -1, boxShadow: "0 12px 36px rgba(212,168,67,.36)" }}
            whileTap={{ scale: 0.98 }}
          >
            Begin Investigation →
          </motion.button>
        </div>
      </motion.div>
    </motion.div>
  );
}
