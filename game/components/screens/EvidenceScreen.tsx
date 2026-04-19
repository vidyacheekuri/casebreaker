"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useState, useRef, useLayoutEffect, useCallback } from "react";
import { useGameStore } from "@/lib/store";
import { HARLOW_MANOR } from "@/lib/cases/harlow-manor";
import type { EvidenceId } from "@/lib/cases/harlow-manor";

// Fixed display order on the board (2 columns × 3 rows)
const BOARD_ORDER: EvidenceId[] = [
  "ev_brandy", "ev_bag",
  "ev_will",   "ev_gloves",
  "ev_diary",  "ev_debt",
];

// Deterministic per-card tilt (deg)
const ROTATIONS: Record<EvidenceId, number> = {
  ev_brandy: -2.5,
  ev_bag:     1.5,
  ev_will:   -1.0,
  ev_gloves:  2.2,
  ev_diary:  -1.8,
  ev_debt:    1.0,
};

// Red-string connections (only drawn when BOTH cards are found)
const CONNECTIONS: Array<{ from: EvidenceId; to: EvidenceId; label: string }> = [
  { from: "ev_will",   to: "ev_diary",   label: "Motive" },
  { from: "ev_diary",  to: "ev_gloves",  label: "Opportunity" },
  { from: "ev_bag",    to: "ev_brandy",  label: "Source" },
  { from: "ev_gloves", to: "ev_brandy",  label: "The poison" },
];

interface CardCenter { x: number; y: number }

export default function EvidenceScreen() {
  const { discoveredEvidence, goTo } = useGameStore();
  const [selected, setSelected] = useState<EvidenceId | null>(null);
  const [centers, setCenters] = useState<Partial<Record<EvidenceId, CardCenter>>>({});

  const boardRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<Partial<Record<EvidenceId, HTMLDivElement>>>({});

  const measureCards = useCallback(() => {
    if (!boardRef.current) return;
    const boardRect = boardRef.current.getBoundingClientRect();
    const next: Partial<Record<EvidenceId, CardCenter>> = {};
    for (const id of BOARD_ORDER) {
      const el = cardRefs.current[id];
      if (el) {
        const r = el.getBoundingClientRect();
        next[id] = {
          x: r.left - boardRect.left + r.width / 2,
          y: r.top - boardRect.top + r.height / 2,
        };
      }
    }
    setCenters(next);
  }, []);

  // Re-measure whenever evidence set or selected card changes (card grows on expand)
  useLayoutEffect(() => {
    measureCards();
  }, [discoveredEvidence, selected, measureCards]);

  const visibleConnections = CONNECTIONS.filter(
    ({ from, to }) => discoveredEvidence.includes(from) && discoveredEvidence.includes(to)
  );

  const allEvidence = HARLOW_MANOR.evidence;

  return (
    <motion.div
      className="flex flex-col h-full"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4 }}
    >
      {/* Header bar */}
      <div
        className="flex items-center justify-between px-5 py-3 flex-shrink-0"
        style={{ borderBottom: "1px solid rgba(255,255,255,.05)" }}
      >
        <div>
          <div className="text-[10px] tracking-[4px] uppercase text-[#D4A843]">Evidence Board</div>
          <div className="text-[10px] text-[#334455] mt-0.5">
            {discoveredEvidence.length} of {allEvidence.length} items collected
          </div>
        </div>
        <button
          onClick={() => goTo("manor")}
          className="text-[10px] tracking-wider uppercase text-[#445566] hover:text-[#C8D0DC] transition-colors"
        >
          ← Back to Manor
        </button>
      </div>

      {/* Cork board */}
      <div
        ref={boardRef}
        className="flex-1 relative overflow-hidden"
        style={{
          background: "#A0722A",
          backgroundImage: [
            "radial-gradient(ellipse at 15% 25%, rgba(90,55,10,.35) 0%, transparent 40%)",
            "radial-gradient(ellipse at 75% 60%, rgba(70,40,5,.3) 0%, transparent 45%)",
            "radial-gradient(ellipse at 45% 85%, rgba(100,60,15,.25) 0%, transparent 35%)",
            "repeating-linear-gradient(0deg, rgba(0,0,0,.03) 0px, rgba(0,0,0,.03) 1px, transparent 1px, transparent 6px)",
            "repeating-linear-gradient(90deg, rgba(0,0,0,.025) 0px, rgba(0,0,0,.025) 1px, transparent 1px, transparent 6px)",
          ].join(", "),
          boxShadow: "inset 0 2px 16px rgba(0,0,0,.4), inset 0 -2px 8px rgba(0,0,0,.2)",
        }}
      >
        {/* Board frame */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            boxShadow: "inset 0 0 0 8px #7A5520, inset 0 0 0 10px #5A3D10",
            zIndex: 10,
          }}
        />

        {/* SVG string layer */}
        <svg
          className="absolute inset-0 w-full h-full pointer-events-none"
          style={{ zIndex: 3 }}
        >
          {visibleConnections.map(({ from, to, label }) => {
            const p1 = centers[from];
            const p2 = centers[to];
            if (!p1 || !p2) return null;
            const mx = (p1.x + p2.x) / 2;
            const my = (p1.y + p2.y) / 2 + Math.abs(p2.x - p1.x) * 0.12 + 14;
            const d = `M ${p1.x} ${p1.y} Q ${mx} ${my} ${p2.x} ${p2.y}`;
            const labelX = mx;
            const labelY = my + 10;
            return (
              <g key={`${from}-${to}`}>
                {/* String shadow */}
                <motion.path
                  d={d}
                  stroke="rgba(0,0,0,.35)"
                  strokeWidth={2.5}
                  fill="none"
                  strokeLinecap="round"
                  initial={{ pathLength: 0, opacity: 0 }}
                  animate={{ pathLength: 1, opacity: 1 }}
                  transition={{ duration: 1.2, ease: "easeInOut" }}
                />
                {/* Red string */}
                <motion.path
                  d={d}
                  stroke="#C0392B"
                  strokeWidth={1.5}
                  fill="none"
                  strokeLinecap="round"
                  initial={{ pathLength: 0, opacity: 0 }}
                  animate={{ pathLength: 1, opacity: 0.85 }}
                  transition={{ duration: 1.2, ease: "easeInOut" }}
                />
                {/* Label */}
                <motion.text
                  x={labelX}
                  y={labelY}
                  textAnchor="middle"
                  fill="rgba(220,180,100,.7)"
                  fontSize={7}
                  fontFamily="Georgia, serif"
                  letterSpacing={1}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 1, duration: 0.4 }}
                >
                  {label.toUpperCase()}
                </motion.text>
              </g>
            );
          })}
        </svg>

        {/* Empty board message */}
        {discoveredEvidence.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center" style={{ zIndex: 2 }}>
            <p
              className="text-sm italic"
              style={{ color: "rgba(60,35,5,.6)", fontFamily: "Georgia, serif" }}
            >
              No evidence collected yet. Search the rooms.
            </p>
          </div>
        )}

        {/* Cards grid */}
        <div
          className="grid grid-cols-2 gap-5 p-6 relative"
          style={{ zIndex: 2 }}
        >
          {BOARD_ORDER.map((evId) => {
            const ev = allEvidence.find((e) => e.id === evId)!;
            const found = discoveredEvidence.includes(evId);
            const isSelected = selected === evId;
            const rotation = ROTATIONS[evId];
            const roomName = HARLOW_MANOR.rooms.find((r) => r.id === ev.room)?.name ?? ev.room;

            return (
              <div
                key={evId}
                ref={(el) => { if (el) cardRefs.current[evId] = el; }}
                className="relative"
                style={{ transform: `rotate(${rotation}deg)` }}
              >
                {/* Thumbtack */}
                {found && (
                  <div
                    style={{
                      position: "absolute",
                      width: 14,
                      height: 14,
                      borderRadius: "50%",
                      background: "radial-gradient(circle at 35% 35%, #F0C040, #B8860B)",
                      border: "1.5px solid rgba(0,0,0,.55)",
                      boxShadow: "0 2px 5px rgba(0,0,0,.6), inset 0 1px 0 rgba(255,255,255,.2)",
                      top: -7,
                      left: "50%",
                      transform: "translateX(-50%)",
                      zIndex: 5,
                    }}
                  />
                )}

                {found ? (
                  <motion.button
                    onClick={() => setSelected(isSelected ? null : evId)}
                    className="w-full text-left"
                    initial={{ opacity: 0, scale: 0.92, y: 8 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    transition={{ duration: 0.35, ease: "easeOut" }}
                    style={{
                      background: isSelected
                        ? "linear-gradient(160deg, #F5EDD0 0%, #EDE0B8 100%)"
                        : "linear-gradient(160deg, #F2E8CA 0%, #E8D8A8 100%)",
                      border: isSelected ? "1px solid rgba(180,130,30,.5)" : "1px solid rgba(160,110,20,.3)",
                      boxShadow: isSelected
                        ? "0 6px 18px rgba(0,0,0,.45), 0 2px 4px rgba(0,0,0,.3)"
                        : "0 3px 10px rgba(0,0,0,.35), 0 1px 3px rgba(0,0,0,.2)",
                      padding: "10px 12px 10px",
                    }}
                  >
                    <div className="text-[11px] font-bold tracking-wide" style={{ color: "#1A0E04" }}>
                      {ev.name}
                    </div>
                    <div
                      className="text-[8px] tracking-wider uppercase mt-0.5"
                      style={{ color: "rgba(100,65,10,.65)" }}
                    >
                      {roomName}
                    </div>

                    <AnimatePresence>
                      {isSelected && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.22 }}
                          className="overflow-hidden"
                        >
                          <p
                            className="text-[10px] leading-relaxed mt-2 pt-2"
                            style={{
                              color: "#2A1A08",
                              fontFamily: "Georgia, serif",
                              borderTop: "1px solid rgba(140,90,20,.25)",
                            }}
                          >
                            {ev.description}
                          </p>
                          {ev.implicates && (
                            <div
                              className="text-[8px] tracking-wider uppercase mt-1.5"
                              style={{ color: "rgba(160,30,20,.7)" }}
                            >
                              Implicates: {HARLOW_MANOR.suspects.find((s) => s.id === ev.implicates)?.name}
                              {ev.isRedHerring ? " (unverified)" : ""}
                            </div>
                          )}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.button>
                ) : (
                  <div
                    style={{
                      background: "rgba(80,50,10,.18)",
                      border: "1px dashed rgba(100,65,15,.3)",
                      padding: "10px 12px",
                      minHeight: 58,
                      display: "flex",
                      alignItems: "center",
                    }}
                  >
                    <div
                      className="text-[9px] tracking-wider"
                      style={{ color: "rgba(80,50,10,.45)", fontFamily: "Georgia, serif" }}
                    >
                      [ Not yet found ]
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Accusation button */}
      {discoveredEvidence.length >= 3 && (
        <motion.div
          className="flex-shrink-0 px-5 py-3"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          style={{ borderTop: "1px solid rgba(255,255,255,.05)" }}
        >
          <button
            onClick={() => goTo("accusation")}
            className="w-full py-3 text-xs tracking-[3px] uppercase transition-all"
            style={{
              background: "rgba(212,168,67,.08)",
              border: "1px solid rgba(212,168,67,.3)",
              color: "#D4A843",
              fontFamily: "Georgia, serif",
            }}
          >
            Make Your Accusation →
          </button>
        </motion.div>
      )}
    </motion.div>
  );
}
