"use client";

import { motion } from "framer-motion";
import type { ReactNode } from "react";

export interface StressVisualizationProps {
  stress: number;
  children: ReactNode;
}

function stressStage(stress: number): "calm" | "medium" | "high" | "extreme" {
  if (stress >= 90) return "extreme";
  if (stress >= 60) return "high";
  if (stress >= 30) return "medium";
  return "calm";
}

function auraFor(stage: ReturnType<typeof stressStage>): string {
  if (stage === "extreme") return "rgba(255,28,28,.34)";
  if (stage === "high") return "rgba(239,68,68,.26)";
  if (stage === "medium") return "rgba(245,158,11,.24)";
  return "rgba(64,148,255,.18)";
}

export default function StressVisualization({ stress, children }: StressVisualizationProps) {
  const stage = stressStage(stress);
  const particleCount = Math.min(30, Math.max(6, Math.round(stress / 4)));
  const aura = auraFor(stage);
  const pulseSpeed = stage === "extreme" ? 0.55 : stage === "high" ? 0.8 : stage === "medium" ? 1.25 : 2.4;

  return (
    <motion.div
      className={`stress-visualization stress-${stage} relative h-full w-full overflow-hidden`}
      animate={{
        x: stage === "extreme" ? [0, -2, 2, -1, 1, 0] : stage === "high" ? [0, -1, 1, 0] : 0,
      }}
      transition={{
        duration: stage === "extreme" ? 0.36 : 0.85,
        repeat: stage === "high" || stage === "extreme" ? Infinity : 0,
      }}
    >
      {children}

      <motion.div
        className="pointer-events-none absolute inset-0 z-10"
        style={{
          background: `radial-gradient(ellipse at 50% 35%, ${aura} 0%, transparent 58%)`,
          mixBlendMode: "screen",
        }}
        animate={{ opacity: stage === "calm" ? [0.45, 0.62, 0.45] : [0.42, 0.95, 0.42] }}
        transition={{ duration: pulseSpeed, repeat: Infinity, ease: "easeInOut" }}
      />

      <div className="pointer-events-none absolute inset-0 z-20">
        {Array.from({ length: particleCount }).map((_, index) => {
          const left = 18 + ((index * 17) % 65);
          const delay = (index % 9) * 0.18;
          const size = stage === "calm" ? 2 : stage === "medium" ? 2.4 : 3;
          return (
            <motion.span
              key={index}
              className="absolute rounded-full"
              style={{
                left: `${left}%`,
                bottom: `${8 + ((index * 11) % 35)}%`,
                width: size,
                height: size,
                background:
                  stage === "calm"
                    ? "rgba(160,200,255,.32)"
                    : stage === "medium"
                      ? "rgba(245,190,80,.45)"
                      : "rgba(255,130,95,.5)",
                boxShadow: stage === "high" || stage === "extreme" ? "0 0 8px rgba(255,80,50,.45)" : "none",
              }}
              animate={{
                y: [-4, -70 - (index % 5) * 12],
                x: [0, (index % 2 === 0 ? 1 : -1) * (8 + (index % 4) * 3)],
                opacity: [0, 0.7, 0],
              }}
              transition={{
                duration: Math.max(1.2, 3.4 - stress / 42),
                repeat: Infinity,
                delay,
                ease: "easeOut",
              }}
            />
          );
        })}
      </div>

      {stage === "extreme" ? (
        <motion.div
          className="pointer-events-none absolute inset-0 z-30"
          style={{
            background: "radial-gradient(circle at 50% 42%, transparent 42%, rgba(100,0,0,.38) 100%)",
          }}
          animate={{ opacity: [0.42, 0.74, 0.42] }}
          transition={{ duration: 0.62, repeat: Infinity, ease: "easeInOut" }}
        />
      ) : null}
    </motion.div>
  );
}
