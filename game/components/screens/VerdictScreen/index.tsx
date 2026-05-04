"use client";

import { motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useGameStore } from "@/lib/store";
import VerdictAnimation from "./VerdictAnimation";
import { computeVerdictScores } from "./verdict-score";

export default function VerdictScreen() {
  const { accusation, activeSlot, resetGame, goTo, accusationEvidenceIds, suspectStress, gameStartTime } =
    useGameStore();
  const [introDone, setIntroDone] = useState(false);

  useEffect(() => {
    if (!accusation || !activeSlot) {
      goTo("intro");
    }
  }, [accusation, activeSlot, goTo]);

  const accused = useMemo(
    () => activeSlot?.suspects.find((s) => s.character_id === accusation?.accused_id) ?? null,
    [accusation, activeSlot]
  );
  const killer = useMemo(
    () => activeSlot?.suspects.find((s) => s.character_id === accusation?.killer_id) ?? null,
    [accusation, activeSlot]
  );

  const accusationEvidence = useMemo(() => {
    if (!activeSlot) return [];
    const set = new Set(accusationEvidenceIds);
    return activeSlot.evidence.filter((e) => set.has(e.evidence_id));
  }, [activeSlot, accusationEvidenceIds]);

  const elapsedSeconds = useMemo(() => {
    if (!accusation) return 300;
    if (accusation.solve_time_seconds != null) return accusation.solve_time_seconds;
    if (gameStartTime != null) return Math.max(60, Math.round((Date.now() - gameStartTime) / 1000));
    return 420;
  }, [accusation, gameStartTime]);

  const scores = useMemo(() => {
    if (!accusation || !activeSlot) {
      return null;
    }
    return computeVerdictScores(accusation, activeSlot, accusationEvidenceIds, suspectStress, elapsedSeconds);
  }, [accusation, activeSlot, accusationEvidenceIds, suspectStress, elapsedSeconds]);

  const shareVerdict = useCallback(async () => {
    if (!accusation || !activeSlot || !scores) return;
    const title = activeSlot.title;
    const result = accusation.correct ? "Solved" : "Wrong accusation";
    const text = `CaseBreaker — ${title}\n${result}\nScore ${scores.total} (Grade ${scores.grade})\nTime ${scores.timeSeconds}s · Evidence ${scores.evidenceAccuracyPct}%`;
    try {
      if (navigator.share) {
        await navigator.share({ title: "CaseBreaker verdict", text });
        return;
      }
    } catch {
      /* fall through */
    }
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      /* ignore */
    }
  }, [accusation, activeSlot, scores]);

  if (!accusation || !activeSlot || !accused || !scores) {
    return null;
  }

  return (
    <div className="relative flex h-full flex-col overflow-hidden">
      {!introDone ? (
        <VerdictAnimation
          accusation={accusation}
          activeSlot={activeSlot}
          accusationEvidence={accusationEvidence}
          accused={accused}
          killer={killer}
          scores={scores}
          onSequenceComplete={() => setIntroDone(true)}
        />
      ) : null}

      <motion.div
        className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-6 py-5"
        initial={{ opacity: 0 }}
        animate={{ opacity: introDone ? 1 : 0 }}
        transition={{ duration: 0.55 }}
        style={{ pointerEvents: introDone ? "auto" : "none" }}
      >
        <motion.div
          className="border-b border-white/5 py-5 text-center"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <div className="text-h1 uppercase tracking-[6px] text-[#445566]">The Verdict</div>
          <div
            className="mb-2 text-3xl font-bold md:text-4xl"
            style={{
              color: accusation.correct ? "#4CAF50" : "#f44336",
              fontFamily: "Georgia, serif",
            }}
          >
            {accusation.correct ? "Case closed." : "Wrong accusation."}
          </div>
          <div className="text-body italic text-[#8899AA]" style={{ fontFamily: "Georgia, serif" }}>
            {accusation.correct
              ? `${accused.name} was the killer.`
              : `${accused.name} was not the killer.`}
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-3 text-label text-[#667788]">
            <span className="rounded border border-[#2a3344] px-2 py-1">Score {scores.total}</span>
            <span className="rounded border border-[#D4A843]/35 px-2 py-1 text-[#D4A843]">Grade {scores.grade}</span>
            <span className="rounded border border-[#2a3344] px-2 py-1">{scores.timeSeconds}s elapsed</span>
          </div>
        </motion.div>

        {!accusation.correct && (
          <motion.div
            className="border border-[#3A2020] p-5"
            style={{ background: "rgba(244,67,54,.04)" }}
            initial={{ opacity: 0, x: -14 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 }}
          >
            <div className="mb-2 text-detail uppercase tracking-[3px] text-[#f44336]">The real killer</div>
            <div className="text-h2 font-semibold text-[#E8E0D0]" style={{ fontFamily: "Georgia, serif" }}>
              {killer?.name ?? accusation.killer_name}
            </div>
          </motion.div>
        )}

        <motion.div
          className="border border-[#1E2A38] p-5"
          style={{ background: "rgba(255,255,255,.015)" }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.28 }}
        >
          <div className="mb-3 text-detail uppercase tracking-[3px] text-[#334455]">Summary</div>
          <p className="text-body leading-relaxed text-[#8899AA]" style={{ fontFamily: "Georgia, serif" }}>
            {accusation.verdict_summary}
          </p>
        </motion.div>

        <motion.div
          className="grid gap-3 border border-[#1E2A38] p-4 text-label"
          style={{ background: "rgba(255,255,255,.02)" }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.34 }}
        >
          <div className="text-detail uppercase tracking-[3px] text-[#334455]">Score breakdown</div>
          <div className="flex justify-between text-[#8899AA]">
            <span>Time performance</span>
            <span className="text-[#C8D0DC]">{scores.timeScore}</span>
          </div>
          <div className="flex justify-between text-[#8899AA]">
            <span>Stress composure</span>
            <span className="text-[#C8D0DC]">{scores.stressScore}</span>
          </div>
          <div className="flex justify-between text-[#8899AA]">
            <span>Evidence picks ({scores.evidenceAccuracyPct}%)</span>
            <span className="text-[#C8D0DC]">{scores.evidenceScore}</span>
          </div>
        </motion.div>

        {accusation.missed_clues.length > 0 && (
          <motion.div
            className="border border-[#1E2A38] p-5"
            style={{ background: "rgba(255,255,255,.01)" }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
          >
            <div className="mb-2 text-detail uppercase tracking-[3px] text-[#334455]">Missed clues</div>
            <ul className="space-y-1">
              {accusation.missed_clues.map((clue, index) => (
                <li key={`${clue}-${index}`} className="flex gap-2 text-label leading-relaxed text-[#667788]">
                  <span className="text-[#334455]">•</span>
                  <span style={{ fontFamily: "Georgia, serif" }}>{clue}</span>
                </li>
              ))}
            </ul>
          </motion.div>
        )}

        <motion.div
          className="mt-auto flex flex-col gap-2 pt-4 sm:flex-row"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
        >
          <motion.button
            type="button"
            onClick={() => void shareVerdict()}
            className="flex-1 py-3 text-caption uppercase tracking-[3px]"
            style={{
              background: "rgba(100,140,210,.1)",
              border: "1px solid rgba(100,140,210,.35)",
              color: "#9EB8E8",
              fontFamily: "Georgia, serif",
            }}
            whileHover={{ scale: 1.02, background: "rgba(100,140,210,.16)" }}
            whileTap={{ scale: 0.98 }}
          >
            Share result
          </motion.button>
          <motion.button
            type="button"
            onClick={resetGame}
            className="flex-1 py-3 text-caption uppercase tracking-[3px]"
            style={{
              background: "rgba(212,168,67,.08)",
              border: "1px solid rgba(212,168,67,.3)",
              color: "#D4A843",
              fontFamily: "Georgia, serif",
            }}
            whileHover={{ scale: 1.02, background: "rgba(212,168,67,.15)" }}
            whileTap={{ scale: 0.98 }}
          >
            Play again
          </motion.button>
        </motion.div>
      </motion.div>
    </div>
  );
}
