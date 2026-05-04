"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import { useParallaxPointer, useParallaxShift } from "./useParallaxPointer";
import AudioReactiveDim from "./AudioReactiveDim";

function dustSpecs(seed: number, count: number) {
  const out: { left: string; top: string; duration: number; delay: number; size: number }[] = [];
  let s = seed;
  const rnd = () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return (s >>> 0) / 2147483648;
  };
  for (let i = 0; i < count; i += 1) {
    out.push({
      left: `${8 + rnd() * 84}%`,
      top: `${5 + rnd() * 90}%`,
      duration: 14 + rnd() * 18,
      delay: rnd() * 12,
      size: 1 + rnd() * 2,
    });
  }
  return out;
}

export default function RoomBackdrop({ roomSeed = 1 }: { roomSeed?: number }) {
  const { springX, springY } = useParallaxPointer();
  const archX = useParallaxShift(springX, 18);
  const archY = useParallaxShift(springY, 12);
  const furnX = useParallaxShift(springX, 28);
  const furnY = useParallaxShift(springY, 16);
  const specs = useMemo(() => dustSpecs(roomSeed, 28), [roomSeed]);

  return (
    <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-[#141c24] via-[#0a1018] to-[#060a10]" />
      <div
        className="absolute -top-[20%] right-[10%] h-[70%] w-[45%] rotate-12 bg-gradient-to-br from-[#D4A843]/12 via-[#8BA4C8]/06 to-transparent blur-3xl"
        aria-hidden
      />
      <motion.div className="absolute inset-0 opacity-[0.35]" style={{ x: archX, y: archY }} aria-hidden>
        <svg viewBox="0 0 400 240" className="h-full w-full" preserveAspectRatio="xMidYMid slice">
          <defs>
            <linearGradient id="beam" x1="0.5" y1="0" x2="0.5" y2="1">
              <stop offset="0%" stopColor="rgba(212,168,67,0.15)" />
              <stop offset="100%" stopColor="transparent" />
            </linearGradient>
          </defs>
          <path d="M120,0 L280,0 L320,240 L80,240 Z" fill="url(#beam)" />
          <path
            d="M40,200 L360,200 M60,180 L340,180 M80,160 L320,160"
            stroke="rgba(255,255,255,0.04)"
            strokeWidth="1"
          />
        </svg>
      </motion.div>
      <motion.div className="absolute bottom-0 left-0 right-0 h-[40%]" style={{ x: furnX, y: furnY }} aria-hidden>
        <svg viewBox="0 0 600 160" preserveAspectRatio="xMidYMax meet" className="h-full w-full opacity-50">
          <rect x="40" y="70" width="140" height="70" rx="2" fill="#080c12" stroke="rgba(212,168,67,0.07)" strokeWidth="0.8" />
          <rect x="420" y="55" width="120" height="85" rx="2" fill="#060a10" stroke="rgba(255,255,255,0.04)" strokeWidth="0.8" />
          <ellipse cx="300" cy="130" rx="200" ry="22" fill="#020508" opacity="0.6" />
        </svg>
      </motion.div>
      {specs.map((spec, i) => (
        <span
          key={`dust-${i}`}
          className="atmosphere-dust pointer-events-none absolute rounded-full bg-[#C8D0DC]/25 shadow-[0_0_6px_rgba(212,168,67,0.15)]"
          style={{
            left: spec.left,
            top: spec.top,
            width: spec.size,
            height: spec.size,
            animationDuration: `${spec.duration}s`,
            animationDelay: `${spec.delay}s`,
          }}
          aria-hidden
        />
      ))}
      <AudioReactiveDim />
    </div>
  );
}
