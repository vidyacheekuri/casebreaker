"use client";

import { useEffect, useState, type ReactNode } from "react";
import type { EvidenceDto } from "@/lib/backend-types";

interface Props {
  evidence: EvidenceDto;
  size?: "card" | "detail" | "compact" | "polaroid" | "room" | "thumb";
  /** Merged onto the wrapper; use to override dimensions when embedding in a fixed slot. */
  className?: string;
}

export default function EvidenceImage({ evidence, size = "card", className = "" }: Props) {
  const [loadFailed, setLoadFailed] = useState(false);
  const imageUrl = evidence.image_url?.trim() || null;
  const isReady = evidence.image_status === "ready";
  const isGenerating = evidence.image_status === "generating";

  useEffect(() => {
    setLoadFailed(false);
  }, [imageUrl, evidence.evidence_id]);

  const showImg = Boolean(imageUrl) && !loadFailed;
  const sizeClass =
    size === "detail"
      ? "mb-4 aspect-[4/3] w-full"
      : size === "compact"
        ? "h-16 w-16"
        : size === "thumb"
          ? "h-full w-full min-h-0 min-w-0"
          : size === "polaroid"
          ? "h-32 w-full rounded-sm"
          : size === "room"
            ? "aspect-square w-full max-w-[min(100%,20rem)] sm:h-80 sm:w-80 sm:max-w-none"
            : "h-80 w-80";

  let inner: ReactNode;
  if (showImg) {
    inner = (
      <img
        src={imageUrl!}
        alt={evidence.name}
        className="h-full w-full object-cover"
        loading="lazy"
        onError={() => setLoadFailed(true)}
      />
    );
  } else if (imageUrl && loadFailed) {
    inner = (
      <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-[radial-gradient(circle_at_center,rgba(212,168,67,.12),rgba(5,10,18,.95))] px-2 text-center">
        <span className="text-label uppercase tracking-[2px] text-[#D4A843]">Image expired</span>
      </div>
    );
  } else if (isReady) {
    inner = (
      <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-[radial-gradient(circle_at_center,rgba(212,168,67,.1),rgba(5,10,18,.95))]">
        <span className="text-h2 text-[#D4A843]/80">✓</span>
        <span className="text-detail uppercase tracking-[2px] text-[#8899AA]">Ready</span>
      </div>
    );
  } else if (isGenerating) {
    inner = (
      <div className="flex h-full w-full flex-col justify-end gap-2 p-3">
        <div className="space-y-2">
          <div className="h-2 w-full animate-pulse rounded bg-white/10" />
          <div className="h-2 w-[80%] animate-pulse rounded bg-white/10" />
          <div className="h-2 w-[60%] animate-pulse rounded bg-white/10" />
        </div>
        <div className="mx-auto mt-2 h-20 w-20 animate-pulse rounded-md bg-white/5" />
      </div>
    );
  } else {
    inner = (
      <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-[radial-gradient(circle_at_center,rgba(212,168,67,.1),rgba(5,10,18,.95))]">
        <div
          className="h-7 w-7 rounded-full border-2 border-[#334455] border-t-[#D4A843]"
          style={{ animation: "spin 0.85s linear infinite" }}
        />
        <span className="text-detail uppercase tracking-[2px] text-[#6E7C92]">Loading</span>
      </div>
    );
  }

  return (
    <div
      className={`relative shrink-0 overflow-hidden rounded-md border border-white/10 bg-black/20 ${sizeClass} ${className}`.trim()}
    >
      {inner}
      {showImg ? (
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/35 to-transparent" />
      ) : null}
    </div>
  );
}
