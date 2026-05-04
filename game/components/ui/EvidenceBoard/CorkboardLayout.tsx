"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import type { DailySlotDto, EvidenceDto } from "@/lib/backend-types";
import { evidenceLinkedSuspectLabel } from "@/lib/store";
import EvidenceImage from "@/components/ui/EvidenceImage";

interface CorkboardLayoutProps {
  evidence: EvidenceDto[];
  activeSlot: DailySlotDto | null;
  selectedSuspectId?: string | null;
  reviewedEvidenceIds?: string[];
  accusationEvidenceIds?: string[];
  onReview?: (evidenceId: string) => void;
}

interface BoardPosition {
  left: number;
  top: number;
  rotate: number;
}

interface StringConnection {
  from: string;
  to: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  kind: "contradiction" | "support";
}

const BOARD_POSITIONS: BoardPosition[] = [
  { left: 8, top: 9, rotate: -1.5 },
  { left: 44, top: 8, rotate: 1.2 },
  { left: 20, top: 40, rotate: 1.5 },
  { left: 58, top: 39, rotate: -1.1 },
  { left: 36, top: 68, rotate: 0.8 },
  { left: 70, top: 67, rotate: -1.6 },
];

function positionFor(index: number): BoardPosition {
  const base = BOARD_POSITIONS[index % BOARD_POSITIONS.length];
  const rowOffset = Math.floor(index / BOARD_POSITIONS.length) * 18;
  return { ...base, top: base.top + rowOffset };
}

function centerOf(position: BoardPosition): { x: number; y: number } {
  return { x: position.left + 12, y: position.top + 14 };
}

function relationKind(item: EvidenceDto, selectedSuspectId?: string | null): "contradiction" | "support" {
  const selectedMatch =
    selectedSuspectId != null &&
    item.implicates.toLowerCase().includes(selectedSuspectId.toLowerCase());
  return item.is_red_herring || selectedMatch ? "contradiction" : "support";
}

function buildConnections(items: EvidenceDto[], selectedSuspectId?: string | null): StringConnection[] {
  const groups = new Map<string, EvidenceDto[]>();

  for (const item of items) {
    const key = item.implicates && item.implicates !== "none" ? item.implicates : item.location;
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }

  const positions = new Map(items.map((item, index) => [item.evidence_id, positionFor(index)]));
  const connections: StringConnection[] = [];

  for (const group of groups.values()) {
    for (let index = 0; index < group.length - 1; index += 1) {
      const from = group[index];
      const to = group[index + 1];
      const fromPosition = positions.get(from.evidence_id);
      const toPosition = positions.get(to.evidence_id);
      if (!fromPosition || !toPosition) continue;

      const start = centerOf(fromPosition);
      const end = centerOf(toPosition);
      connections.push({
        from: from.evidence_id,
        to: to.evidence_id,
        x1: start.x,
        y1: start.y,
        x2: end.x,
        y2: end.y,
        kind: relationKind(from, selectedSuspectId),
      });
    }
  }

  if (connections.length === 0 && items.length > 1) {
    for (let index = 0; index < items.length - 1; index += 1) {
      const fromPosition = positionFor(index);
      const toPosition = positionFor(index + 1);
      const start = centerOf(fromPosition);
      const end = centerOf(toPosition);
      connections.push({
        from: items[index].evidence_id,
        to: items[index + 1].evidence_id,
        x1: start.x,
        y1: start.y,
        x2: end.x,
        y2: end.y,
        kind: relationKind(items[index], selectedSuspectId),
      });
    }
  }

  return connections;
}

export default function CorkboardLayout({
  evidence,
  activeSlot,
  selectedSuspectId = null,
  reviewedEvidenceIds = [],
  accusationEvidenceIds = [],
  onReview,
}: CorkboardLayoutProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const connections = useMemo(
    () => buildConnections(evidence, selectedSuspectId),
    [evidence, selectedSuspectId]
  );
  const boardHeight = Math.min(640, Math.max(500, 420 + Math.ceil(evidence.length / 3) * 80));

  function toggleExpanded(evidenceId: string) {
    onReview?.(evidenceId);
    setExpandedIds((current) => {
      const next = new Set(current);
      if (next.has(evidenceId)) {
        next.delete(evidenceId);
      } else {
        next.add(evidenceId);
      }
      return next;
    });
  }

  return (
    <div
      className="corkboard relative w-full overflow-hidden border border-[#4B2F1D]/70 p-5"
      style={{ minHeight: boardHeight }}
    >
      <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
        <defs>
          <filter id="stringGlow" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="0.7" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        {connections.map((connection, index) => {
          const active = hoveredId === connection.from || hoveredId === connection.to;
          const stroke = connection.kind === "contradiction" ? "#B32222" : "#4C8A45";
          return (
            <motion.line
              key={`${connection.from}-${connection.to}-${index}`}
              x1={connection.x1}
              y1={connection.y1}
              x2={connection.x2}
              y2={connection.y2}
              stroke={active ? "#D4A843" : stroke}
              strokeWidth={active ? 0.55 : 0.38}
              strokeLinecap="round"
              filter={active ? "url(#stringGlow)" : undefined}
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{ pathLength: 1, opacity: active ? 0.95 : 0.68 }}
              transition={{ delay: index * 0.12, duration: 0.65, ease: "easeOut" }}
            />
          );
        })}
      </svg>

      {evidence.map((item, index) => {
        const position = positionFor(index);
        const pinnedOpen = expandedIds.has(item.evidence_id);
        const expanded = pinnedOpen || hoveredId === item.evidence_id;
        const reviewed = reviewedEvidenceIds.includes(item.evidence_id);
        const accusation = accusationEvidenceIds.includes(item.evidence_id);
        const kind = relationKind(item, selectedSuspectId);
        const linkedSuspectLabel = evidenceLinkedSuspectLabel(activeSlot, item);

        return (
          <motion.button
            key={item.evidence_id}
            type="button"
            onClick={() => toggleExpanded(item.evidence_id)}
            onMouseEnter={() => setHoveredId(item.evidence_id)}
            onMouseLeave={() => setHoveredId(null)}
            className="corkboard-card absolute w-[min(360px,42vw)] text-left outline-none transition-[filter,box-shadow] duration-300 hover:shadow-[0_20px_48px_rgba(212,168,67,0.14),0_0_28px_rgba(95,145,230,0.1)]"
            style={{
              left: `${position.left}%`,
              top: `${position.top}%`,
              transform: `rotate(${position.rotate}deg)`,
            }}
            whileHover={{
              y: -10,
              scale: 1.035,
              rotate: position.rotate * 0.45,
              zIndex: 20,
            }}
            transition={{ type: "spring", stiffness: 260, damping: 20 }}
          >
            <span className="pushpin absolute left-1/2 top-[-10px] z-20 h-5 w-5 -translate-x-1/2 rounded-full border border-[#641414] bg-[#B32222] shadow-[0_4px_8px_rgba(0,0,0,.35)]" />
            <span className="absolute left-1/2 top-[-2px] z-10 h-3 w-px -translate-x-1/2 bg-black/35" />

            <div className="relative rounded-sm bg-[#F4EADB] p-2.5 shadow-[0_18px_28px_rgba(0,0,0,.36)]">
              <div className="flex gap-2.5">
                <div className="h-32 w-32 shrink-0 overflow-hidden rounded-sm border border-[#6A4B35]/20 bg-[#EFE0CA]">
                  <EvidenceImage evidence={item} size="thumb" />
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-1">
                    <div className="min-w-0 font-semibold text-[15px] leading-snug text-[#2D2117]" style={{ fontFamily: "Georgia, serif" }}>
                      {item.name}
                    </div>
                    <div className="flex shrink-0 gap-0.5 pt-0.5">
                      {reviewed ? <span className="h-1.5 w-1.5 rounded-full bg-[#4C8A45]" title="Reviewed" /> : null}
                      {accusation ? <span className="h-1.5 w-1.5 rounded-full bg-[#D4A843]" title="Accusation" /> : null}
                      {kind === "contradiction" ? (
                        <span className="h-1.5 w-1.5 rounded-full bg-[#B32222]" title="Contradiction / herring" />
                      ) : null}
                    </div>
                  </div>
                  <div className="mt-0.5 text-[11px] uppercase tracking-wide text-[#667788]">{item.location}</div>
                  {!expanded ? (
                    <p className="mt-1 line-clamp-2 text-[12px] leading-snug text-[#8899AA]">{item.description}</p>
                  ) : null}
                </div>
              </div>

              {expanded ? (
                <div className="mt-2 border-t border-[#6A4B35]/25 pt-2 text-left">
                  <p className="text-[12px] leading-snug text-[#8899AA]" style={{ fontFamily: "Georgia, serif" }}>
                    {item.description}
                  </p>
                  <div className="mt-1 text-[12px] text-[#D4A843]">Linked: {linkedSuspectLabel}</div>
                </div>
              ) : null}
            </div>
          </motion.button>
        );
      })}
    </div>
  );
}
