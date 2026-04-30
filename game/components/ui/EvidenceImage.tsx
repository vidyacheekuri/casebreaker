"use client";

import type { EvidenceDto } from "@/lib/backend-types";

interface Props {
  evidence: EvidenceDto;
  size?: "card" | "detail" | "compact";
}

export default function EvidenceImage({ evidence, size = "card" }: Props) {
  const imageUrl = evidence.image_url || null;
  const sizeClass =
    size === "detail" ? "mb-4 aspect-[4/3] w-full" : size === "compact" ? "h-16 w-16" : "h-80 w-80";

  return (
    <div
      className={`relative shrink-0 overflow-hidden rounded-md border border-white/10 bg-black/20 ${sizeClass}`}
    >
      {imageUrl ? (
        <img
          src={imageUrl}
          alt={evidence.name}
          className="h-full w-full object-cover"
          loading="lazy"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-[radial-gradient(circle_at_center,rgba(212,168,67,.14),rgba(5,10,18,.95))]">
          <span className="text-[10px] uppercase tracking-[2px] text-[#D4A843]">
            {evidence.image_status === "generating" ? "Loading" : "Clue"}
          </span>
        </div>
      )}

      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/35 to-transparent" />
    </div>
  );
}
