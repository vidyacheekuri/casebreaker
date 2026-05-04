"use client";

import { motion } from "framer-motion";
import { useParallaxPointer, useParallaxShift } from "./useParallaxPointer";
import AudioReactiveDim from "./AudioReactiveDim";

export default function ManorBackdrop() {
  const { springX, springY } = useParallaxPointer();
  const treeX = useParallaxShift(springX, 22);
  const treeY = useParallaxShift(springY, 14);
  const manorX = useParallaxShift(springX, 38);
  const manorY = useParallaxShift(springY, 22);
  const moonX = useParallaxShift(springX, 8);
  const moonY = useParallaxShift(springY, 6);

  return (
    <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-[#0c1830] via-[#070E1A] to-[#03060d]" />
      <motion.div className="absolute -right-[8%] top-[6%] h-[72px] w-[72px] rounded-full bg-[#8BA4C8]/18 blur-md" style={{ x: moonX, y: moonY }} />
      <motion.div
        className="absolute -left-[5%] bottom-0 h-[48%] w-[110%]"
        style={{ x: treeX, y: treeY }}
      >
        <svg
          viewBox="0 0 1200 280"
          preserveAspectRatio="none"
          className="h-full w-full text-[#030910]"
          fill="currentColor"
          aria-hidden
        >
          <path d="M0,180 Q80,120 160,160 T320,140 T480,155 T640,130 T800,148 T960,125 T1120,145 L1200,135 L1200,280 L0,280 Z" opacity="0.92" />
          <path d="M0,200 Q100,150 220,175 T440,155 T660,170 T880,150 T1100,165 L1200,158 L1200,280 L0,280 Z" opacity="0.78" />
          <path d="M0,235 L40,190 L55,210 L90,175 L110,200 L150,165 L175,195 L220,160 L250,205 L290,175 L320,215 L380,185 L420,225 L480,195 L520,230 L580,200 L620,238 L680,210 L730,245 L800,215 L860,252 L920,225 L980,260 L1040,235 L1100,268 L1160,248 L1200,270 L1200,280 L0,280 Z" opacity="0.55" />
        </svg>
      </motion.div>
      <motion.div
        className="absolute -left-[3%] bottom-[8%] h-[28%] w-[85%]"
        style={{ x: manorX, y: manorY }}
      >
        <svg viewBox="0 0 800 220" preserveAspectRatio="xMidYMax meet" className="h-full w-full" aria-hidden>
          <defs>
            <linearGradient id="manorFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#060d18" />
              <stop offset="100%" stopColor="#02050a" />
            </linearGradient>
          </defs>
          <path
            d="M400,20 L520,85 L500,85 L500,200 L300,200 L300,85 L280,85 Z"
            fill="url(#manorFill)"
            stroke="rgba(212,168,67,0.08)"
            strokeWidth="1"
          />
          <rect x="330" y="120" width="36" height="48" fill="#050a12" stroke="rgba(212,168,67,0.06)" strokeWidth="0.5" />
          <rect x="430" y="115" width="40" height="52" fill="#050a12" stroke="rgba(212,168,67,0.06)" strokeWidth="0.5" />
          <path d="M180,200 L200,130 L620,130 L640,200 Z" fill="#080f1a" opacity="0.9" />
          <rect x="260" y="155" width="280" height="8" rx="1" fill="rgba(212,168,67,0.06)" />
        </svg>
      </motion.div>
      <div
        className="atmosphere-fog-a pointer-events-none absolute -left-[20%] bottom-0 h-[42%] w-[140%] bg-gradient-to-t from-[#1a2838]/55 via-transparent to-transparent blur-3xl"
        aria-hidden
      />
      <div
        className="atmosphere-fog-b pointer-events-none absolute -right-[15%] bottom-[5%] h-[35%] w-[90%] rounded-[50%] bg-[#5c6b7c]/12 blur-[56px]"
        aria-hidden
      />
      <AudioReactiveDim />
    </div>
  );
}
