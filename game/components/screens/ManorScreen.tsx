"use client";

import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import { useEffect } from "react";
import { useGameStore } from "@/lib/store";
import { HARLOW_MANOR } from "@/lib/cases/harlow-manor";
import type { RoomId, SuspectId } from "@/lib/cases/harlow-manor";

export default function ManorScreen() {
  const { goTo, selectRoom, selectSuspect, discoveredEvidence, searchedRooms } = useGameStore();

  // Mouse parallax
  const rawX = useMotionValue(0);
  const rawY = useMotionValue(0);
  const springX = useSpring(rawX, { stiffness: 40, damping: 18 });
  const springY = useSpring(rawY, { stiffness: 40, damping: 18 });
  const bgX = useTransform(springX, [-0.5, 0.5], ["-14px", "14px"]);
  const bgY = useTransform(springY, [-0.5, 0.5], ["-9px", "9px"]);
  const roomsX = useTransform(springX, [-0.5, 0.5], ["-5px", "5px"]);
  const roomsY = useTransform(springY, [-0.5, 0.5], ["-3px", "3px"]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      rawX.set(e.clientX / window.innerWidth - 0.5);
      rawY.set(e.clientY / window.innerHeight - 0.5);
    };
    window.addEventListener("mousemove", handler);
    return () => window.removeEventListener("mousemove", handler);
  }, [rawX, rawY]);

  function openRoom(roomId: RoomId) {
    selectRoom(roomId);
    goTo("room");
  }

  function openSuspect(suspectId: SuspectId) {
    selectSuspect(suspectId);
    goTo("interrogation");
  }

  const canAccuse = discoveredEvidence.length >= 3;

  return (
    <motion.div
      className="flex flex-col h-full px-6 py-5 gap-5 overflow-y-auto relative"
      initial={{ opacity: 0, x: 30 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -30 }}
      transition={{ duration: 0.4 }}
    >
      {/* Parallax background decoration */}
      <motion.div
        className="absolute inset-0 pointer-events-none select-none overflow-hidden"
        style={{ x: bgX, y: bgY, zIndex: 0 }}
        aria-hidden
      >
        <div
          className="absolute"
          style={{
            top: "8%",
            right: "4%",
            width: 220,
            height: 180,
            opacity: 0.035,
            backgroundImage: [
              "repeating-linear-gradient(0deg, #D4A843 0px, #D4A843 1px, transparent 1px, transparent 18px)",
              "repeating-linear-gradient(90deg, #D4A843 0px, #D4A843 1px, transparent 1px, transparent 18px)",
            ].join(", "),
          }}
        />
        <div
          className="absolute text-[#D4A843] tracking-[6px] uppercase"
          style={{ bottom: "12%", left: "3%", fontSize: 9, opacity: 0.04, writingMode: "vertical-rl", letterSpacing: 8 }}
        >
          Harlow Manor · Devon · 1923
        </div>
      </motion.div>

      {/* Header */}
      <div className="flex items-center justify-between relative" style={{ zIndex: 1 }}>
        <div>
          <div className="text-[10px] tracking-[4px] uppercase text-[#D4A843]">Harlow Manor</div>
          <div className="text-xs text-[#445566] italic mt-0.5">Devon, England · October 1923</div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => goTo("evidence")}
            className="text-[10px] tracking-wider uppercase px-3 py-1.5 rounded transition-colors"
            style={{
              border: "1px solid rgba(255,255,255,.1)",
              color: discoveredEvidence.length > 0 ? "#C8D0DC" : "#334455",
              background: "rgba(255,255,255,.02)",
            }}
          >
            Evidence Board ({discoveredEvidence.length})
          </button>
          {canAccuse && (
            <motion.button
              onClick={() => goTo("accusation")}
              className="text-[10px] tracking-wider uppercase px-3 py-1.5 rounded transition-colors"
              style={{
                border: "1px solid rgba(212,168,67,.4)",
                color: "#D4A843",
                background: "rgba(212,168,67,.08)",
              }}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              whileHover={{ background: "rgba(212,168,67,.15)" }}
            >
              Make Accusation →
            </motion.button>
          )}
        </div>
      </div>

      {/* Rooms + Suspects with parallax */}
      <motion.div className="flex flex-col gap-5 relative" style={{ x: roomsX, y: roomsY, zIndex: 1 }}>

      {/* Rooms */}
      <div>
        <div className="text-[9px] tracking-[4px] uppercase text-[#334455] mb-3">
          Rooms to Search
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {HARLOW_MANOR.rooms.map((room) => {
            const searched = searchedRooms.includes(room.id);
            const foundHere = room.evidence.filter((id) => discoveredEvidence.includes(id)).length;
            return (
              <motion.button
                key={room.id}
                onClick={() => openRoom(room.id)}
                className="text-left p-4 border transition-all"
                style={{
                  background: searched ? "rgba(255,255,255,.03)" : "rgba(255,255,255,.015)",
                  borderColor: searched ? "rgba(212,168,67,.2)" : "rgba(255,255,255,.06)",
                }}
                whileHover={{ borderColor: "rgba(212,168,67,.4)", background: "rgba(255,255,255,.04)" }}
              >
                <div className="text-xs font-semibold text-[#C8D0DC] tracking-wide">{room.name}</div>
                <div className="text-[9px] text-[#445566] mt-1 leading-relaxed line-clamp-2">{room.description}</div>
                {searched && (
                  <div className="text-[9px] text-[#D4A843] mt-2 tracking-wide">
                    {foundHere > 0 ? `${foundHere} evidence found` : "Searched — nothing found"}
                  </div>
                )}
                {!searched && (
                  <div className="text-[9px] text-[#334455] mt-2 tracking-wider uppercase">
                    Search →
                  </div>
                )}
              </motion.button>
            );
          })}
        </div>
      </div>

      {/* Suspects */}
      <div>
        <div className="text-[9px] tracking-[4px] uppercase text-[#334455] mb-3">
          Suspects to Interrogate
        </div>
        <div className="grid grid-cols-3 gap-2">
          {HARLOW_MANOR.suspects.map((s) => {
            const stress = useGameStore.getState().suspectStress[s.id];
            const hasHistory = useGameStore.getState().interrogationHistories[s.id].length > 0;
            return (
              <motion.button
                key={s.id}
                onClick={() => openSuspect(s.id)}
                className="p-4 border text-left transition-all"
                style={{
                  background: "rgba(255,255,255,.015)",
                  borderColor: hasHistory ? "rgba(212,168,67,.2)" : "rgba(255,255,255,.06)",
                }}
                whileHover={{ borderColor: "rgba(212,168,67,.4)", background: "rgba(255,255,255,.04)" }}
              >
                {/* Portrait */}
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold mb-3"
                  style={{ background: "rgba(255,255,255,.05)", border: "1px solid rgba(255,255,255,.08)", color: "#8899AA" }}
                >
                  {s.portrait}
                </div>
                <div className="text-xs font-semibold text-[#C8D0DC]">{s.name}</div>
                <div className="text-[9px] text-[#445566] mt-0.5">{s.occupation}</div>
                <div className="text-[9px] text-[#334455] italic mt-1 leading-snug">{s.relationship}</div>
                {/* Stress bar */}
                {stress > 0 && (
                  <div className="mt-2">
                    <div className="h-0.5 w-full rounded-full bg-white/5 overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${stress}%`,
                          background: stress >= 70 ? "#f44336" : stress >= 40 ? "#FF9800" : "#4CAF50",
                        }}
                      />
                    </div>
                    <div className="text-[8px] text-[#445566] mt-0.5">
                      {stress >= 70 ? "Breaking" : stress >= 40 ? "Uneasy" : "Calm"}
                    </div>
                  </div>
                )}
                {!hasHistory && (
                  <div className="text-[9px] text-[#334455] mt-2 tracking-wider uppercase">
                    Interrogate →
                  </div>
                )}
              </motion.button>
            );
          })}
        </div>
      </div>

      </motion.div>{/* end parallax wrapper */}

      {/* Hint */}
      {!canAccuse && (
        <div className="text-[10px] text-[#2A3344] text-center italic relative" style={{ fontFamily: "Georgia, serif", zIndex: 1 }}>
          Search rooms and interrogate suspects to gather evidence before making an accusation.
        </div>
      )}
    </motion.div>
  );
}
