"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import { useGameStore } from "@/lib/store";
import { useParallaxPointer, useParallaxShift } from "./useParallaxPointer";
import AudioReactiveDim from "./AudioReactiveDim";

function shimmerDots(stress: number, seed: number, audioBoost: number) {
  const base = 10 + stress * 0.22 + audioBoost * 14;
  const n = Math.min(48, Math.round(base));
  const out: { left: string; top: string; delay: number; scale: number }[] = [];
  let s = seed;
  const rnd = () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return (s >>> 0) / 4294967296;
  };
  for (let i = 0; i < n; i += 1) {
    out.push({
      left: `${rnd() * 96}%`,
      top: `${rnd() * 88}%`,
      delay: rnd() * 5,
      scale: 0.6 + rnd() * 0.9,
    });
  }
  return out;
}

export default function InterrogationBackdrop({
  stress,
  particleBoost = 0,
}: {
  stress: number;
  /** Extra tension (e.g. contradictory evidence selected). */
  particleBoost?: number;
}) {
  const ambientAudioIntensity = useGameStore((s) => s.ambientAudioIntensity);
  const { springX, springY } = useParallaxPointer();
  const wallX = useParallaxShift(springX, 16);
  const wallY = useParallaxShift(springY, 10);
  const lampX = useParallaxShift(springX, 32);
  const lampY = useParallaxShift(springY, 20);

  const t = Math.max(0, Math.min(1, stress / 100));
  const tension = Math.max(0, Math.min(1, t + particleBoost * 0.08));

  const moodLayers = useMemo(() => {
    const coolA = 0.08 + (1 - t) * 0.14;
    const warmA = 0.04 + t * 0.22;
    return {
      cool: `linear-gradient(195deg, rgba(45,85,145,${coolA}) 0%, rgba(7,14,26,0) 52%)`,
      warm: `radial-gradient(ellipse 100% 70% at 50% -5%, rgba(220,90,45,${warmA * 0.85}) 0%, transparent 55%), linear-gradient(180deg, rgba(180,55,30,${warmA * 0.5}) 0%, transparent 45%)`,
      vignette: `${Math.round(56 + t * 72)}px`,
      vignetteAlpha: 0.28 + t * 0.22 + particleBoost * 0.04,
    };
  }, [t, particleBoost]);

  const dots = useMemo(
    () => shimmerDots(stress + particleBoost * 25, 42_001, ambientAudioIntensity),
    [stress, particleBoost, ambientAudioIntensity]
  );

  return (
    <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-[#0a0e1a] via-[#070a12] to-[#030407]" />
      <div className="absolute inset-0 opacity-[0.16] bg-[linear-gradient(90deg,rgba(255,255,255,0.045)_1px,transparent_1px),linear-gradient(0deg,rgba(255,255,255,0.035)_1px,transparent_1px)] bg-[size:42px_42px]" />
      <div className="absolute inset-0" style={{ background: moodLayers.cool }} aria-hidden />
      <div className="absolute inset-0 mix-blend-screen" style={{ background: moodLayers.warm }} aria-hidden />
      <motion.div className="absolute inset-0 opacity-25" style={{ x: wallX, y: wallY }} aria-hidden>
        <svg viewBox="0 0 100 100" className="h-full w-full" preserveAspectRatio="none">
          <defs>
            <pattern id="brick" width="12" height="8" patternUnits="userSpaceOnUse">
              <rect width="12" height="8" fill="none" stroke="rgba(255,255,255,0.03)" strokeWidth="0.3" />
            </pattern>
          </defs>
          <rect width="100" height="100" fill="url(#brick)" />
          <rect x="20" y="15" width="24" height="18" fill="#050910" stroke="rgba(30,58,95,0.12)" strokeWidth="0.2" />
          <rect x="58" y="20" width="22" height="16" fill="#050910" stroke="rgba(232,232,232,0.08)" strokeWidth="0.2" />
          <rect x="66" y="24" width="10" height="7" fill="rgba(232,232,232,0.04)" stroke="rgba(232,232,232,0.08)" strokeWidth="0.2" />
        </svg>
      </motion.div>
      <motion.div className="absolute -right-[8%] top-[4%] h-[55%] w-[40%]" style={{ x: lampX, y: lampY }} aria-hidden>
        <div
          className="absolute right-[30%] top-0 h-[18%] w-[28%] rounded-full bg-[#D4A843]/25 blur-2xl"
          style={{ opacity: 0.35 + t * 0.45 }}
        />
        <svg viewBox="0 0 200 240" className="h-full w-full opacity-[0.5]" preserveAspectRatio="xMidYMin meet">
          <path
            d="M100,8 L120,40 L80,40 Z"
            fill="#0f1115"
            stroke="rgba(232,232,232,0.14)"
            strokeWidth="0.5"
          />
          <line x1="100" y1="40" x2="100" y2="120" stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
          <ellipse cx="100" cy="130" rx="50" ry="14" fill="#080c12" opacity="0.85" />
        </svg>
      </motion.div>
      <div
        className="absolute inset-0"
        style={{
          boxShadow: `inset 0 0 ${moodLayers.vignette} rgba(0,0,0,${moodLayers.vignetteAlpha})`,
        }}
        aria-hidden
      />
      {dots.map((d, i) => (
        <span
          key={`shimmer-${i}`}
          className="atmosphere-shimmer pointer-events-none absolute rounded-full bg-[#D4A843]/20"
          style={{
            left: d.left,
            top: d.top,
            width: 2 * d.scale,
            height: 2 * d.scale,
            animationDelay: `${d.delay}s`,
            opacity: 0.2 + tension * 0.45,
          }}
          aria-hidden
        />
      ))}
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_35%,rgba(0,0,0,0.35)_100%)]"
        style={{ opacity: 0.55 + tension * 0.25 }}
        aria-hidden
      />
      <AudioReactiveDim />
    </div>
  );
}
