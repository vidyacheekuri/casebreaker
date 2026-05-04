"use client";

import { motion } from "framer-motion";

export interface StressGaugeProps {
  stress: number;
  suspectName: string;
}

function stressLabel(stress: number): string {
  if (stress >= 70) return "High";
  if (stress >= 40) return "Watch";
  return "Low";
}

function stressColor(stress: number): string {
  if (stress >= 70) return "#f44336";
  if (stress >= 40) return "#FF9800";
  return "#4CAF50";
}

export default function StressGauge({ stress, suspectName }: StressGaugeProps) {
  const clamped = Math.max(0, Math.min(100, stress));

  return (
    <div className="flex items-center gap-2 font-mono" aria-label={`${suspectName} stress ${Math.round(clamped)} percent`}>
      <div className="text-detail uppercase tracking-[1.5px] text-[#c0c0c0]">Stress</div>
      <div className="h-5 w-2 overflow-hidden border border-[#2a2a3a] bg-[#05070c]">
        <motion.div
          className="w-full"
          initial={false}
          animate={{ height: `${clamped}%`, backgroundColor: stressColor(clamped) }}
          transition={{ duration: 0.45, ease: "easeOut" }}
          style={{ transformOrigin: "bottom" }}
        />
      </div>
      <div className="min-w-10 text-detail uppercase tracking-[1.5px] text-[#7d8796]">{stressLabel(clamped)}</div>
    </div>
  );
}
