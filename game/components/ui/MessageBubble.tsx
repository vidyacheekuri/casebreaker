"use client";

import { motion } from "framer-motion";
import { useId, useState } from "react";
import type { EvidenceDto } from "@/lib/backend-types";
import type { Message } from "@/lib/store";
import EvidenceImage from "@/components/ui/EvidenceImage";
import { messageTurnIndex, segmentMessageWithEvidence, type EvidenceSegment } from "@/components/ui/message-evidence-highlighter";

const MAX_TURNS_SHOW = 10;

export type ToneVisual = "nervous" | "defensive" | "evasive" | "calm" | "hostile" | "neutral";

export function toneToVisual(tone: string | undefined): ToneVisual {
  const t = (tone ?? "").trim().toLowerCase();
  if (["nervous", "anxious"].includes(t)) return "nervous";
  if (["defensive", "guarded"].includes(t)) return "defensive";
  if (t === "evasive") return "evasive";
  if (["calm", "composed"].includes(t)) return "calm";
  if (t === "hostile") return "hostile";
  return "neutral";
}

function ToneCue({ visual }: { visual: ToneVisual }) {
  if (visual === "neutral") return null;
  const labels: Record<Exclude<ToneVisual, "neutral">, string> = {
    nervous: "· nervous",
    defensive: "· defensive",
    evasive: "· evasive",
    calm: "· calm",
    hostile: "· hostile",
  };
  return (
    <span
      className="ml-1 rounded px-1 py-0.5 text-detail font-semibold uppercase tracking-wide"
      style={{
        background:
          visual === "hostile"
            ? "rgba(220,60,60,.2)"
            : visual === "defensive"
              ? "rgba(220,100,80,.18)"
              : visual === "nervous"
                ? "rgba(234,179,8,.2)"
                : visual === "evasive"
                  ? "rgba(148,163,184,.18)"
                  : "rgba(148,213,255,.15)",
        color:
          visual === "hostile"
            ? "#fca5a5"
            : visual === "defensive"
              ? "#fdba74"
              : visual === "nervous"
                ? "#fde047"
                : visual === "evasive"
                  ? "#94a3b8"
                  : "#e0f2fe",
      }}
    >
      {labels[visual as Exclude<ToneVisual, "neutral">]}
    </span>
  );
}

function EvidenceInline({
  segment,
  bubbleId,
}: {
  segment: Extract<EvidenceSegment, { type: "evidence" }>;
  bubbleId: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline">
      <button
        type="button"
        className="mx-0.5 inline cursor-help border-b-2 border-[#D4A843]/70 bg-[#D4A843]/10 px-0.5 font-medium text-[#F4E4A8] underline decoration-[#D4A843]/40 decoration-1 underline-offset-2"
        aria-describedby={open ? `${bubbleId}-tip` : undefined}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
      >
        {segment.value}
        {segment.contradicts ? (
          <span className="ml-0.5 inline-block text-caption leading-none text-red-400" title="Contradicts this suspect">
            ⚠
          </span>
        ) : null}
      </button>
      {open ? (
        <span
          id={`${bubbleId}-tip`}
          role="tooltip"
          className="absolute bottom-full left-1/2 z-50 mb-2 w-48 -translate-x-1/2 rounded-md border border-white/10 bg-[rgba(7,14,26,0.88)] p-2 shadow-[0_12px_40px_rgba(0,0,0,.55)] backdrop-blur-md"
        >
          <EvidenceImage evidence={segment.evidence} size="compact" />
          <div className="mt-1.5 text-detail font-semibold text-[#D4A843]">{segment.evidence.name}</div>
          <p className="mt-0.5 line-clamp-3 text-detail leading-snug text-[#8899AA]">{segment.evidence.description}</p>
        </span>
      ) : null}
    </span>
  );
}

function RichContent({
  content,
  evidenceList,
  contradicts,
  visual,
  bubbleId,
}: {
  content: string;
  evidenceList: EvidenceDto[];
  contradicts: (e: EvidenceDto) => boolean;
  visual: ToneVisual;
  bubbleId: string;
}) {
  const segments =
    evidenceList.length > 0 ? segmentMessageWithEvidence(content, evidenceList, contradicts) : [{ type: "text" as const, value: content }];

  const toneClass =
    visual === "evasive"
      ? "text-[#9ca3af]/90"
      : visual === "calm" || visual === "neutral"
        ? "text-[#E8EDF2]"
        : visual === "nervous"
          ? "text-[#FEF08A]"
          : visual === "defensive"
            ? "text-[#fdba74] font-bold"
            : visual === "hostile"
              ? "text-[#fca5a5] font-extrabold"
              : "text-[#E8EDF2]";

  const hostileClip = visual === "hostile" ? "message-tone-hostile-edge" : "";

  return (
    <span className={`${toneClass} inline-block ${hostileClip}`.trim()}>
      {segments.map((seg, i) =>
        seg.type === "text" ? (
          <span key={`t-${i}`}>{seg.value}</span>
        ) : (
          <EvidenceInline key={`e-${i}-${seg.evidence.evidence_id}`} segment={seg} bubbleId={bubbleId} />
        )
      )}
    </span>
  );
}

type BubbleProps = {
  message: Message;
  index: number;
  allMessages: Message[];
  suspectName: string;
  stress?: number;
  evidenceList: EvidenceDto[];
  contradictsEvidence: (e: EvidenceDto) => boolean;
};

export function HistoryMessageBubble({
  message,
  index,
  allMessages,
  suspectName,
  stress = 0,
  evidenceList,
  contradictsEvidence,
}: BubbleProps) {
  const isDetective = message.role === "user";
  const visual = isDetective ? "neutral" : toneToVisual(message.tone);
  const turn = messageTurnIndex(allMessages, index);
  const bubbleId = useId();

  const stressAfter =
    message.role === "assistant" && message.stressDelta != null && message.stressDelta > 0 ? message.stressDelta : null;

  const detectiveBorder = "rgba(184,134,11,.62)";
  const detectiveBg = "linear-gradient(165deg, rgba(184,134,11,.13) 0%, rgba(10,14,26,0.78) 100%)";
  const detectiveText = "#e8e8e8";

  const suspectTextColor = stress >= 90 ? "#f0b4aa" : stress >= 60 ? "#d7c1a0" : stress >= 30 ? "#c9c0aa" : "#c0c0c0";
  const suspectBorderColor = stress >= 60 ? "rgba(139,0,0,.55)" : stress >= 30 ? "rgba(184,134,11,.42)" : "rgba(42,42,58,.95)";
  const suspectBase = "rgba(10,14,26,0.82)";
  const suspectBackground =
    stress >= 60
      ? `linear-gradient(160deg, rgba(120,30,26,.18), ${suspectBase})`
      : stress >= 30
        ? `linear-gradient(160deg, rgba(245,158,11,.12), ${suspectBase})`
        : suspectBase;

  return (
    <motion.div
      layout
      className={`max-w-[92%] ${isDetective ? "ml-auto self-end" : "mr-auto self-start"}`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.22, ease: [0.22, 0.61, 0.36, 1] }}
    >
      <div
        className="border border-[#2a2a3a] px-4 py-3 text-sm leading-relaxed shadow-[0_12px_34px_rgba(0,0,0,.48)] backdrop-blur-md transition-[box-shadow,border-color] duration-300 hover:shadow-[0_14px_38px_rgba(30,58,95,0.16)]"
        style={{
          borderColor: isDetective ? detectiveBorder : suspectBorderColor,
          background: isDetective ? detectiveBg : suspectBackground,
          color: isDetective ? detectiveText : suspectTextColor,
          fontFamily: "Georgia, serif",
          clipPath: !isDetective && visual === "hostile" ? "polygon(0 2%, 98% 0, 100% 96%, 2% 100%)" : undefined,
        }}
      >
        <div className="mb-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 font-mono text-detail uppercase tracking-wider text-[#7f8997]">
          <span>{isDetective ? "Detective" : suspectName}</span>
          {!isDetective ? <ToneCue visual={visual} /> : null}
          <span className="ml-auto text-detail font-normal normal-case tracking-normal text-[#556677]">
            Turn {Math.min(turn, MAX_TURNS_SHOW)} of {MAX_TURNS_SHOW}
          </span>
          {stressAfter ? (
            <span
              className="border border-[#8b0000]/60 bg-[#260707]/80 px-1.5 py-0.5 text-detail font-bold text-[#ffb3a8]"
              title="Stress applied this reply"
            >
              +{stressAfter} stress
            </span>
          ) : null}
        </div>
        <div className="text-body leading-relaxed">
          <RichContent
            content={message.content}
            evidenceList={evidenceList}
            contradicts={contradictsEvidence}
            visual={visual}
            bubbleId={bubbleId}
          />
        </div>
        {message.timestamp ? (
          <div className="mt-1.5 text-detail text-[#4a5568]">{new Date(message.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div>
        ) : null}
      </div>
    </motion.div>
  );
}

type StreamingProps = {
  content: string;
  isRevealing: boolean;
  suspectName: string;
  stress: number;
  evidenceList: EvidenceDto[];
  contradictsEvidence: (e: EvidenceDto) => boolean;
  streamKey: number | string;
};

export function StreamingMessageBubble({
  content,
  isRevealing,
  suspectName,
  stress,
  evidenceList,
  contradictsEvidence,
  streamKey,
}: StreamingProps) {
  const visual = "neutral";
  const bubbleId = useId();

  const suspectTextColor = stress >= 90 ? "#f0b4aa" : stress >= 60 ? "#d7c1a0" : stress >= 30 ? "#c9c0aa" : "#c0c0c0";
  const suspectBorderColor = stress >= 60 ? "rgba(139,0,0,.55)" : stress >= 30 ? "rgba(184,134,11,.42)" : "rgba(42,42,58,.95)";
  const suspectBase = "rgba(10,14,26,0.82)";
  const suspectBackground =
    stress >= 60
      ? `linear-gradient(160deg, rgba(120,30,26,.18), ${suspectBase})`
      : stress >= 30
        ? `linear-gradient(160deg, rgba(245,158,11,.12), ${suspectBase})`
        : suspectBase;

  return (
    <motion.div
      key={streamKey}
      className="mr-auto max-w-[92%] self-start"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.25, ease: [0.22, 0.61, 0.36, 1] }}
    >
      <div
        className="border border-[#2a2a3a] px-4 py-3 text-sm leading-relaxed shadow-[0_12px_34px_rgba(0,0,0,.48)] backdrop-blur-md transition-[box-shadow] duration-300 hover:shadow-[0_14px_38px_rgba(30,58,95,0.16)]"
        style={{
          borderColor: suspectBorderColor,
          background: suspectBackground,
          color: suspectTextColor,
          fontFamily: "Georgia, serif",
        }}
      >
        <div className="mb-1 font-mono text-detail uppercase tracking-wider text-[#7f8997]">{suspectName}</div>
        <div className="text-body leading-relaxed">
          <RichContent content={content} evidenceList={evidenceList} contradicts={contradictsEvidence} visual={visual} bubbleId={bubbleId} />
          {isRevealing ? <span className="ml-0.5 inline-block h-3 w-0.5 animate-pulse bg-[#D4A843]" /> : null}
        </div>
      </div>
    </motion.div>
  );
}
