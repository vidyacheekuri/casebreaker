"use client";

import type { SuspectDto } from "@/lib/backend-types";

export interface SuspectSelectorProps {
  suspect: SuspectDto;
  isSelected: boolean;
  stress: number;
  onClick: () => void;
}

export default function SuspectSelector({ suspect, isSelected, stress, onClick }: SuspectSelectorProps) {
  const stressed = stress >= 40;

  return (
    <button
      type="button"
      onClick={onClick}
      className="pointer-events-auto rounded-lg border px-4 py-3 text-center backdrop-blur-sm transition-colors"
      style={{
        zIndex: 20,
        borderColor: isSelected ? "rgba(212,168,67,.35)" : "rgba(255,255,255,.08)",
        background: "rgba(5,10,18,.72)",
      }}
    >
      <div className="text-h2 font-semibold uppercase tracking-[2px] text-[#E8E0D0]" style={{ fontFamily: "Georgia, serif" }}>
        {suspect.name}
      </div>
      <div className="mt-1 text-label tracking-wider text-[#D4A843]">{stressed ? "Visibly tense" : "Composed"}</div>
      <div className="mt-0.5 text-detail italic text-[#445566]">{suspect.occupation}</div>
    </button>
  );
}
