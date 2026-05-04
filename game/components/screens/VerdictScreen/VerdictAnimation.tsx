"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AccuseResponse, DailySlotDto, EvidenceDto, SuspectDto } from "@/lib/backend-types";
import EvidenceImage from "@/components/ui/EvidenceImage";
import type { VerdictScoreBreakdown } from "./verdict-score";
import { stampEvidenceSlide } from "./verdict-score";

type Stage = 1 | 2 | 3 | 4 | 5;

type Props = {
  accusation: AccuseResponse;
  activeSlot: DailySlotDto;
  accusationEvidence: EvidenceDto[];
  accused: SuspectDto;
  killer: SuspectDto | null;
  scores: VerdictScoreBreakdown;
  onSequenceComplete: () => void;
};

function playDrumroll(ms = 2000): () => void {
  let done = false;
  const ctx = new AudioContext();
  const master = ctx.createGain();
  master.gain.value = 0.12;
  master.connect(ctx.destination);

  const osc = ctx.createOscillator();
  osc.type = "triangle";
  osc.frequency.value = 72;
  const og = ctx.createGain();
  og.gain.value = 0.85;
  osc.connect(og);
  og.connect(master);

  const noise = ctx.createBufferSource();
  const buf = ctx.createBuffer(1, ctx.sampleRate * 1, ctx.sampleRate);
  const ch = buf.getChannelData(0);
  for (let i = 0; i < ch.length; i += 1) ch[i] = (Math.random() * 2 - 1) * 0.15;
  noise.buffer = buf;
  noise.loop = true;
  const ng = ctx.createGain();
  ng.gain.value = 0.04;
  noise.connect(ng);
  ng.connect(master);

  void ctx.resume();
  osc.start();
  noise.start();

  let beat = 0;
  const id = window.setInterval(() => {
    if (done) return;
    beat += 1;
    const t = ctx.currentTime;
    osc.frequency.setValueAtTime(64 + (beat % 3) * 18, t);
    master.gain.setTargetAtTime(0.08 + (beat % 4) * 0.02, t, 0.04);
  }, 110);

  const stop = () => {
    if (done) return;
    done = true;
    window.clearInterval(id);
    try {
      osc.stop();
      noise.stop();
    } catch {
      /* */
    }
    void ctx.close();
  };

  window.setTimeout(stop, ms);
  return stop;
}

function playSting(): void {
  const ctx = new AudioContext();
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = "sine";
  o.frequency.value = 220;
  g.gain.setValueAtTime(0, ctx.currentTime);
  g.gain.linearRampToValueAtTime(0.18, ctx.currentTime + 0.02);
  g.gain.linearRampToValueAtTime(0.001, ctx.currentTime + 0.35);
  o.connect(g);
  g.connect(ctx.destination);
  void ctx.resume();
  o.start();
  o.stop(ctx.currentTime + 0.4);
  window.setTimeout(() => void ctx.close(), 500);
}

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function seededRandom(seed: number): number {
  const x = Math.sin(seed * 9999.17) * 10000;
  return x - Math.floor(x);
}

export default function VerdictAnimation({
  accusation,
  activeSlot,
  accusationEvidence,
  accused,
  killer,
  scores,
  onSequenceComplete,
}: Props) {
  const [stage, setStage] = useState<Stage>(1);
  const [progress, setProgress] = useState(0);
  const drumStopRef = useRef<(() => void) | null>(null);
  const completedRef = useRef(false);

  const killerName = killer?.name ?? accusation.killer_name;

  const slides = useMemo(() => {
    const list = accusationEvidence.length > 0 ? accusationEvidence : activeSlot.evidence.slice(0, 3);
    return list.map((ev, i) => ({
      ev,
      stamp: stampEvidenceSlide(ev, accusation.killer_id, killerName),
      fromLeft: i % 2 === 0,
    }));
  }, [accusation.killer_id, accusationEvidence, activeSlot.evidence, killerName]);

  const finish = useCallback(() => {
    if (completedRef.current) return;
    completedRef.current = true;
    drumStopRef.current?.();
    onSequenceComplete();
  }, [onSequenceComplete]);

  useEffect(() => {
    const timers: number[] = [];
    const sch = (fn: () => void, ms: number) => {
      timers.push(window.setTimeout(fn, ms));
    };

    sch(() => setProgress(0.35), 120);
    sch(() => setProgress(0.72), 900);
    sch(() => setProgress(1), 2400);

    sch(() => setStage(2), 2800);

    const perSlide = 680;
    const s2dur = 900 + perSlide * Math.max(1, slides.length);
    sch(() => setStage(3), 2800 + s2dur);

    sch(() => setStage(4), 2800 + s2dur + 2400);

    sch(() => setStage(5), 2800 + s2dur + 2400 + 3400);

    const endAll = 2800 + s2dur + 2400 + 3400 + 4200;
    sch(finish, endAll);

    return () => {
      timers.forEach(clearTimeout);
      drumStopRef.current?.();
    };
  }, [finish, slides.length]);

  useEffect(() => {
    const safetyTimeout = window.setTimeout(() => {
      finish();
    }, 6000);

    return () => window.clearTimeout(safetyTimeout);
  }, [finish]);

  useEffect(() => {
    if (stage !== 3) return;
    drumStopRef.current?.();
    drumStopRef.current = playDrumroll(2100);
    playSting();
    return () => {
      drumStopRef.current?.();
    };
  }, [stage]);

  const particles = useMemo(
    () =>
      Array.from({ length: 56 }, (_, i) => ({
        i,
        r: 40 + seededRandom(i + 1) * 120,
        angle: (i / 56) * Math.PI * 2 + seededRandom(i + 101) * 0.4,
        delay: seededRandom(i + 201) * 0.4,
        dur: 2.5 + seededRandom(i + 301) * 1.8,
      })),
    []
  );

  const confetti = useMemo(
    () =>
      Array.from({ length: 48 }, (_, i) => ({
        i,
        x: (seededRandom(i + 401) - 0.5) * 360,
        rot: seededRandom(i + 501) * 720 - 360,
        color: seededRandom(i + 601) > 0.45 ? "#D4A843" : seededRandom(i + 701) > 0.5 ? "#e8dcc8" : "#7cb8ff",
        delay: seededRandom(i + 801) * 0.35,
        duration: 2.8 + seededRandom(i + 901),
        w: 3 + seededRandom(i + 1001) * 5,
        h: 2 + seededRandom(i + 1101) * 6,
      })),
    []
  );

  return (
    <div className="fixed inset-0 z-[200] flex flex-col bg-[#05070c] text-[#E8E0DC]">
      <button
        type="button"
        onClick={() => {
          drumStopRef.current?.();
          finish();
        }}
        className="absolute right-4 top-4 z-[250] rounded border border-white/10 bg-black/40 px-2 py-1 text-detail uppercase tracking-wider text-[#667788] hover:text-[#C8D0DC]"
        style={{ fontFamily: "Georgia, serif" }}
      >
        Skip
      </button>

      <AnimatePresence>
        {stage === 3 && (
          <motion.div
            key="flashes"
            className="pointer-events-none absolute inset-0 z-[220]"
            initial={{ opacity: 0 }}
            animate={{
              opacity: [0, 0.55, 0, 0.4, 0, 0.35, 0],
              background: [
                "rgba(255,255,255,0)",
                "rgba(255,248,230,0.55)",
                "rgba(255,255,255,0)",
                "rgba(212,168,67,0.35)",
                "rgba(255,255,255,0)",
                "rgba(255,255,255,0.28)",
                "rgba(255,255,255,0)",
              ],
            }}
            transition={{ duration: 2.2, times: [0, 0.15, 0.3, 0.45, 0.6, 0.78, 1] }}
          />
        )}
      </AnimatePresence>

      {stage === 5 && !accusation.correct ? (
        <motion.div
          className="pointer-events-none absolute inset-0 z-[210] bg-red-950/35"
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 0.5, 0.2, 0] }}
          transition={{ duration: 1.4, times: [0, 0.2, 0.5, 1] }}
        />
      ) : null}

      {stage === 5 && accusation.correct ? (
        <div className="pointer-events-none absolute inset-0 z-[205] overflow-hidden">
          {confetti.map((c) => (
            <motion.span
              key={c.i}
              className="absolute left-1/2 top-0 block rounded-[1px]"
              style={{
                width: c.w,
                height: c.h,
                background: c.color,
                marginLeft: c.x,
              }}
              initial={{ y: "35vh", opacity: 0, rotate: 0 }}
              animate={{ y: "110vh", opacity: [0, 1, 1, 0.8], rotate: c.rot }}
              transition={{ duration: c.duration, delay: c.delay, ease: "linear" }}
            />
          ))}
        </div>
      ) : null}

      <div className="relative flex min-h-0 flex-1 flex-col items-center justify-center px-4 py-8">
        <AnimatePresence mode="wait">
          {stage === 1 && (
            <motion.div
              key="s1"
              className="flex w-full max-w-md flex-col items-center gap-6"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
            >
              <p className="text-center text-body tracking-wide text-[#D4A843]" style={{ fontFamily: "Georgia, serif" }}>
                Analyzing evidence…
              </p>
              <div className="h-2 w-full overflow-hidden rounded-full bg-[#1a2030]">
                <motion.div
                  className="h-full rounded-full bg-gradient-to-r from-[#8B6914] via-[#D4A843] to-[#f0e4c0]"
                  initial={{ width: "0%" }}
                  animate={{ width: `${progress * 100}%` }}
                  transition={{ duration: 0.35 }}
                />
              </div>
              <div className="pointer-events-none relative h-40 w-full max-w-sm">
                {particles.map((p) => (
                  <motion.span
                    key={p.i}
                    className="absolute left-1/2 top-1/2 block h-1 w-1 rounded-full bg-[#D4A843]/50"
                    style={{ marginLeft: -2, marginTop: -2 }}
                    animate={{
                      x: [0, Math.cos(p.angle) * p.r, Math.cos(p.angle + 0.8) * p.r * 0.6],
                      y: [0, Math.sin(p.angle) * p.r, Math.sin(p.angle + 0.8) * p.r * 0.6],
                      opacity: [0.2, 0.85, 0.3],
                    }}
                    transition={{ duration: p.dur, repeat: Infinity, delay: p.delay, ease: "easeInOut" }}
                  />
                ))}
              </div>
            </motion.div>
          )}

          {stage === 2 && (
            <motion.div
              key="s2"
              className="flex w-full max-w-lg flex-col gap-4"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <p className="text-center text-h2 uppercase tracking-[4px] text-[#445566]">Exhibits reviewed</p>
              <div className="flex flex-col gap-3">
                {slides.map(({ ev, stamp, fromLeft }, idx) => (
                  <motion.div
                    key={ev.evidence_id}
                    className="relative flex items-center gap-3 overflow-hidden rounded-lg border border-[#2a3144] bg-[#0c1018]/95 p-3"
                    initial={{ opacity: 0, x: fromLeft ? -120 : 120, scale: 0.92 }}
                    animate={{ opacity: 1, x: 0, scale: 1 }}
                    transition={{ delay: idx * 0.12, duration: 0.45, ease: [0.22, 0.61, 0.36, 1] }}
                  >
                    <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded border border-white/10">
                      <EvidenceImage evidence={ev} size="compact" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-h2 font-semibold text-[#C8D0DC]" style={{ fontFamily: "Georgia, serif" }}>
                        {ev.name}
                      </div>
                      <div className="text-detail text-[#556677]">{ev.location}</div>
                    </div>
                    <motion.div
                      className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-2 text-xl font-black ${
                        stamp === "check"
                          ? "border-emerald-500/70 bg-emerald-950/40 text-emerald-400"
                          : "border-red-500/60 bg-red-950/35 text-red-400"
                      }`}
                      initial={{ scale: 0, rotate: -40 }}
                      animate={{ scale: 1, rotate: 0 }}
                      transition={{ delay: idx * 0.12 + 0.22, type: "spring", stiffness: 400, damping: 18 }}
                    >
                      {stamp === "check" ? "✓" : "✗"}
                    </motion.div>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}

          {stage === 3 && (
            <motion.div
              key="s3"
              className="flex flex-col items-center gap-4 text-center"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
            >
              <motion.p
                className="max-w-sm text-h2 font-bold tracking-wide text-[#F5ECD8] md:text-xl"
                style={{ fontFamily: "Georgia, serif", textShadow: "0 0 40px rgba(212,168,67,0.35)" }}
                animate={{ opacity: [0.85, 1, 0.9, 1] }}
                transition={{ duration: 1.8, repeat: Infinity }}
              >
                The guilty party is…
              </motion.p>
            </motion.div>
          )}

          {stage === 4 && (
            <motion.div
              key="s4"
              className="flex flex-col items-center"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <motion.div
                className="w-full max-w-xs rounded-xl border-2 border-[#D4A843]/45 bg-gradient-to-b from-[#1a1510] to-[#0a0c10] px-6 py-8 text-center shadow-[0_0_60px_rgba(212,168,67,0.25)]"
                initial={{ y: 24, rotateY: -12, scale: 0.94 }}
                animate={{
                  y: [8, 0, 4, 0],
                  rotateY: [-6, 4, -2, 0],
                  rotateZ: [-1.5, 1.2, -0.5, 0],
                  scale: [0.94, 1, 0.99, 1],
                  boxShadow: [
                    "0 0 30px rgba(212,168,67,0.2)",
                    "0 0 55px rgba(212,168,67,0.45)",
                    "0 0 40px rgba(212,168,67,0.3)",
                    "0 0 50px rgba(212,168,67,0.35)",
                  ],
                }}
                transition={{ duration: 3.2, ease: "easeInOut" }}
                style={{ fontFamily: "Georgia, serif", perspective: 1000 }}
              >
                <div className="mb-2 text-detail uppercase tracking-[5px] text-[#8899AA]">Accused</div>
                <div className="text-2xl font-bold text-[#F4EAD8]">{accused.name}</div>
                <div className="mt-1 text-body italic text-[#8899AA]">{accused.occupation}</div>
              </motion.div>
            </motion.div>
          )}

          {stage === 5 && (
            <motion.div
              key="s5"
              className="flex w-full max-w-md flex-col items-center gap-5"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <motion.div
                className={`text-center text-3xl font-black md:text-4xl ${
                  accusation.correct ? "text-emerald-400" : "text-red-400"
                }`}
                style={{ fontFamily: "Georgia, serif" }}
                initial={{ scale: 0.8 }}
                animate={{ scale: [0.85, 1.08, 1] }}
                transition={{ duration: 0.55, ease: [0.34, 1.56, 0.64, 1] }}
              >
                {accusation.correct ? "Correct" : "Incorrect"}
              </motion.div>
              <div
                className="w-full rounded-lg border border-[#2a3344] bg-[#080c12]/90 p-4 text-label"
                style={{ fontFamily: "Georgia, serif" }}
              >
                <div className="mb-3 flex items-end justify-between border-b border-white/5 pb-2">
                  <span className="text-[#8899AA]">Total score</span>
                  <span className="text-3xl font-bold text-[#D4A843]">{scores.total}</span>
                  <span className="rounded border border-[#D4A843]/40 px-2 py-0.5 text-h2 font-black text-[#D4A843]">
                    {scores.grade}
                  </span>
                </div>
                <div className="space-y-2 text-[#aab6c4]">
                  <div className="flex justify-between">
                    <span>Time ({formatDuration(scores.timeSeconds)})</span>
                    <span className="text-[#C8D0DC]">{scores.timeScore}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Stress composure (avg {scores.averageStress})</span>
                    <span className="text-[#C8D0DC]">{scores.stressScore}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Evidence accuracy ({scores.evidenceAccuracyPct}%)</span>
                    <span className="text-[#C8D0DC]">{scores.evidenceScore}</span>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
