"use client";

import { useGameStore } from "@/lib/store";

/** Darkens the scene as procedural ambient audio (rain, heartbeat, ticks) gets louder. */
export default function AudioReactiveDim({ className = "" }: { className?: string }) {
  const intensity = useGameStore((s) => s.ambientAudioIntensity);
  const opacity = 0.08 + intensity * 0.34;

  return (
    <div
      className={`pointer-events-none absolute inset-0 z-[5] bg-[#02060c] transition-[opacity] duration-500 ${className}`}
      style={{ opacity }}
      aria-hidden
    />
  );
}
