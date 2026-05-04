"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { EvidenceDto } from "@/lib/backend-types";
import type { Message } from "@/lib/store";
import { segmentMessageWithEvidence } from "@/components/ui/message-evidence-highlighter";

export type TimelineVariant = "gold" | "blue" | "red" | "neutral";

export interface CaseTimelineEvent {
  id: string;
  sortTime: number;
  variant: TimelineVariant;
  title: string;
  detail: string;
  timeLabel: string;
  stressDelta?: number;
  missedContradiction?: boolean;
  isCurrentQuestion?: boolean;
}

const SLIPPERY = new Set(["evasive", "defensive", "guarded", "nervous"]);

function formatClock(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function userPressedContradiction(
  userContent: string,
  evidenceList: EvidenceDto[],
  contradicts: (e: EvidenceDto) => boolean
): boolean {
  const segments = segmentMessageWithEvidence(userContent, evidenceList, contradicts);
  return segments.some((s) => s.type === "evidence" && s.contradicts);
}

function buildCaseTimelineEvents(params: {
  messages: Message[];
  activeSlot: { evidence: EvidenceDto[] } | null;
  discoveredEvidence: string[];
  contradictoryEvidence: EvidenceDto[];
  contradictsEvidence: (e: EvidenceDto) => boolean;
  allEvidence: EvidenceDto[];
  isLoading: boolean;
  activeStreamingText: string;
}): CaseTimelineEvent[] {
  const {
    messages,
    activeSlot,
    discoveredEvidence,
    contradictoryEvidence,
    contradictsEvidence,
    allEvidence,
    isLoading,
    activeStreamingText,
  } = params;

  const byId = new Map<string, EvidenceDto>();
  for (const ev of activeSlot?.evidence ?? []) {
    byId.set(ev.evidence_id, ev);
  }

  const baseTime =
    messages[0]?.timestamp != null ? new Date(messages[0].timestamp).getTime() : Date.now();

  const evidenceNodes: CaseTimelineEvent[] = discoveredEvidence.map((id, index) => {
    const ev = byId.get(id);
    return {
      id: `ev-${id}`,
      sortTime: baseTime - (discoveredEvidence.length - index) * 60_000,
      variant: "gold" as const,
      title: "Clue discovered",
      detail: ev?.name ?? "Unknown item",
      timeLabel: "Case file",
    };
  });

  const lastUserIndex = messages.reduce((acc, m, i) => (m.role === "user" ? i : acc), -1);
  const streaming = Boolean(activeStreamingText.trim());

  const qa: CaseTimelineEvent[] = [];
  for (let i = 0; i < messages.length; i += 1) {
    const msg = messages[i];
    if (msg.role === "user") {
      const isLastUser = i === lastUserIndex;
      const isCurrentQuestion = isLastUser && (isLoading || streaming);
      const next = messages[i + 1];
      const missed =
        next?.role === "assistant" &&
        contradictoryEvidence.length > 0 &&
        (next.stressDelta ?? 0) < 8 &&
        SLIPPERY.has((next.tone ?? "").toLowerCase()) &&
        !userPressedContradiction(msg.content, allEvidence, contradictsEvidence);

      qa.push({
        id: `q-${msg.timestamp ?? `i${i}`}-${i}`,
        sortTime: msg.timestamp ? new Date(msg.timestamp).getTime() : baseTime + i * 2000,
        variant: "blue",
        title: "Question",
        detail: msg.content.length > 72 ? `${msg.content.slice(0, 72)}…` : msg.content,
        timeLabel: formatClock(msg.timestamp),
        missedContradiction: Boolean(missed),
        isCurrentQuestion,
      });
    } else {
      const stressDelta = msg.stressDelta ?? 0;
      const tone = (msg.tone ?? "").toLowerCase();
      let variant: TimelineVariant = "neutral";
      if (stressDelta >= 12 || (tone === "hostile" && stressDelta >= 4)) variant = "gold";
      else if (stressDelta >= 8) variant = "red";
      else if (tone === "hostile") variant = "gold";

      qa.push({
        id: `a-${msg.timestamp ?? `i${i}`}-${i}`,
        sortTime: msg.timestamp ? new Date(msg.timestamp).getTime() : baseTime + i * 2000 + 1,
        variant,
        title: "Response",
        detail:
          msg.content.length > 80
            ? `${msg.content.slice(0, 80)}…`
            : msg.content + (tone ? ` · ${tone}` : ""),
        timeLabel: formatClock(msg.timestamp),
        stressDelta: stressDelta > 0 ? stressDelta : undefined,
      });
    }
  }

  return [...evidenceNodes, ...qa].sort((a, b) => a.sortTime - b.sortTime);
}

function dotClass(variant: TimelineVariant, current: boolean): string {
  const base =
    "relative z-[1] flex h-3 w-3 shrink-0 items-center justify-center rounded-full border-2 transition-shadow duration-300";
  const currentCls = current
    ? "ring-2 ring-[#D4A843]/75 ring-offset-2 ring-offset-[rgba(7,14,26,0.95)]"
    : "";
  const byVar: Record<TimelineVariant, string> = {
    gold: "border-[#D4A843] bg-[#D4A843]/40 shadow-[0_0_14px_rgba(212,168,67,0.35)]",
    blue: "border-[#6BA3E8] bg-[#6BA3E8]/35 shadow-[0_0_12px_rgba(107,163,232,0.3)]",
    red: "border-[#F87171] bg-[#F87171]/35 shadow-[0_0_14px_rgba(248,113,113,0.35)]",
    neutral: "border-white/30 bg-white/15 shadow-none",
  };
  return [base, byVar[variant], currentCls].filter(Boolean).join(" ");
}

export interface CaseTimelineProps {
  suspectName: string;
  messages: Message[];
  activeSlot: { evidence: EvidenceDto[] } | null;
  discoveredEvidence: string[];
  contradictoryEvidence: EvidenceDto[];
  contradictsEvidence: (e: EvidenceDto) => boolean;
  allEvidence: EvidenceDto[];
  isLoading: boolean;
  activeStreamingText: string;
}

export default function CaseTimeline({
  suspectName,
  messages,
  activeSlot,
  discoveredEvidence,
  contradictoryEvidence,
  contradictsEvidence,
  allEvidence,
  isLoading,
  activeStreamingText,
}: CaseTimelineProps) {
  const [open, setOpen] = useState(true);

  const events = useMemo(
    () =>
      buildCaseTimelineEvents({
        messages,
        activeSlot,
        discoveredEvidence,
        contradictoryEvidence,
        contradictsEvidence,
        allEvidence,
        isLoading,
        activeStreamingText,
      }),
    [
      messages,
      activeSlot,
      discoveredEvidence,
      contradictoryEvidence,
      contradictsEvidence,
      allEvidence,
      isLoading,
      activeStreamingText,
    ]
  );

  if (!open) {
    return (
      <div className="flex w-10 shrink-0 flex-col border-l border-[#2a2a3a] bg-[#060910]/90 backdrop-blur-md">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex flex-1 flex-col items-center gap-2 py-4 font-mono text-detail uppercase tracking-[0.15em] text-[#7d8796] transition-colors hover:bg-white/[0.04] hover:text-[#b8860b]"
          title="Show case timeline"
          aria-expanded="false"
        >
          <span
            className="flex h-8 w-8 items-center justify-center border border-[#2a2a3a] bg-[#0a0e1a] text-[#b8860b]"
            aria-hidden
          >
            ⧖
          </span>
          <span className="[writing-mode:vertical-rl] rotate-180">Timeline</span>
        </button>
      </div>
    );
  }

  return (
    <aside className="flex max-h-full w-[212px] shrink-0 flex-col border-l border-[#2a2a3a] bg-[#060910]/92 font-mono shadow-[-14px_0_36px_rgba(0,0,0,0.35)] backdrop-blur-md">
      <div className="flex items-center justify-between gap-2 border-b border-[#2a2a3a] px-3 py-2.5">
        <div className="min-w-0">
          <div className="text-detail uppercase tracking-[2px] text-[#b8860b]">Interview Log</div>
          <div className="truncate text-label text-[#8a96a6]">{suspectName}</div>
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="shrink-0 border border-[#2a2a3a] bg-[#0a0e1a] px-2 py-1 text-detail uppercase tracking-wider text-[#a7b0bf] transition-colors hover:border-[#b8860b]/50 hover:text-[#b8860b]"
          aria-expanded="true"
          title="Hide timeline"
        >
          Hide
        </button>
      </div>

      <div className="relative flex-1 overflow-y-auto overflow-x-hidden px-3 py-3">
        {events.length === 0 ? (
          <p className="text-center text-label italic leading-relaxed text-[#556677]">
            Discover clues and question suspects to build your timeline.
          </p>
        ) : (
          <>
            <motion.div
              key={`spine-${events.length}`}
              className="pointer-events-none absolute bottom-5 left-[17px] top-5 w-px origin-top bg-gradient-to-b from-[#b8860b]/40 via-[#1e3a5f]/35 to-white/5"
              initial={{ scaleY: 0, opacity: 0.6 }}
              animate={{ scaleY: 1, opacity: 1 }}
              transition={{ duration: 0.65, ease: [0.22, 0.61, 0.36, 1] }}
              style={{ transformOrigin: "top" }}
            />
            <ul className="relative z-[2] flex flex-col gap-3.5">
              <AnimatePresence initial={false}>
                {events.map((event, idx) => {
                  const isLatest = idx === events.length - 1;
                  return (
                    <motion.li
                      key={event.id}
                      initial={{ opacity: 0, x: -18 }}
                      animate={{
                        opacity: 1,
                        x: 0,
                        transition: { duration: 0.38, ease: [0.22, 0.61, 0.36, 1] },
                      }}
                      exit={{ opacity: 0, x: -10 }}
                      className="group flex gap-3"
                    >
                      <div className="relative flex flex-col items-center pt-0.5">
                        <motion.span
                          className={dotClass(event.variant, Boolean(event.isCurrentQuestion))}
                          animate={
                            isLatest
                              ? {
                                  scale: [1, 1.18, 1],
                                  boxShadow: [
                                    "0 0 0 rgba(212,168,67,0)",
                                    "0 0 16px rgba(212,168,67,0.45)",
                                    "0 0 0 rgba(212,168,67,0)",
                                  ],
                                }
                              : {}
                          }
                          transition={{ duration: 0.9, ease: "easeOut" }}
                        />
                      </div>
                      <div className="relative min-w-0 flex-1 pb-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-detail uppercase tracking-[1.5px] text-[#8a96a6]">{event.title}</span>
                          <span className="text-detail text-[#556677]">{event.timeLabel}</span>
                          {event.missedContradiction ? (
                            <span className="text-caption" title="Possible missed pressure — damning evidence not stressed in question">
                              ⚠️
                            </span>
                          ) : null}
                          {event.isCurrentQuestion ? (
                            <span className="border border-[#b8860b]/50 bg-[#211909] px-1 py-px text-detail uppercase tracking-wider text-[#b8860b]">
                              Now
                            </span>
                          ) : null}
                        </div>
                        <div
                          className="mt-1 line-clamp-3 cursor-default text-body leading-snug text-[#C8D0DC]"
                          title={`${event.title}: ${event.detail}`}
                        >
                          {event.detail}
                        </div>
                        {event.stressDelta != null && event.stressDelta > 0 ? (
                          <div className="mt-1.5 max-w-[92px]">
                            <div className="mb-0.5 flex justify-between text-detail uppercase tracking-wider text-[#5c6678]">
                              <span>Stress</span>
                              <span>+{event.stressDelta}</span>
                            </div>
                            <div className="h-1 overflow-hidden rounded-full bg-black/35">
                              <motion.div
                                className="h-full rounded-full bg-gradient-to-r from-[#6BA3E8] via-[#D4A843] to-[#F87171]"
                                initial={{ width: 0 }}
                                animate={{ width: `${Math.min(100, event.stressDelta * 6)}%` }}
                                transition={{ duration: 0.45, ease: "easeOut" }}
                              />
                            </div>
                          </div>
                        ) : null}
                        <div className="pointer-events-none absolute left-0 top-full z-30 mt-1 min-w-[188px] translate-y-0.5 rounded-md border border-white/10 bg-[rgba(7,14,26,0.94)] p-2 text-label text-[#A8B4C4] opacity-0 shadow-[0_12px_40px_rgba(0,0,0,0.45)] transition-[opacity,transform] duration-150 group-hover:pointer-events-auto group-hover:translate-y-0 group-hover:opacity-100 max-md:hidden">
                          <div className="font-semibold text-[#D4A843]">{event.title}</div>
                          <p className="mt-1 leading-relaxed text-[#C8D0DC]">{event.detail}</p>
                          <p className="mt-1 text-detail text-[#556677]">{event.timeLabel}</p>
                        </div>
                      </div>
                    </motion.li>
                  );
                })}
              </AnimatePresence>
            </ul>
          </>
        )}
      </div>

      <div className="border-t border-white/10 px-3 py-2 text-detail uppercase tracking-[1.5px] text-[#445566]">
        <span className="text-[#b8860b]">●</span> Breakthrough &nbsp;
        <span className="text-[#6BA3E8]">●</span> Question &nbsp;
        <span className="text-[#F87171]">●</span> Stress
      </div>
    </aside>
  );
}
