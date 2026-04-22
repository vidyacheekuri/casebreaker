"use client";

import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import { useEffect } from "react";
import { useGameStore } from "@/lib/store";

export default function ManorScreen() {
  const {
    goTo,
    activeSlot,
    rooms,
    selectRoom,
    selectSuspect,
    discoveredEvidence,
    searchedRooms,
    suspectStress,
    interrogationHistories,
  } = useGameStore();

  const rawX = useMotionValue(0);
  const rawY = useMotionValue(0);
  const springX = useSpring(rawX, { stiffness: 40, damping: 18 });
  const springY = useSpring(rawY, { stiffness: 40, damping: 18 });
  const bgX = useTransform(springX, [-0.5, 0.5], ["-14px", "14px"]);
  const bgY = useTransform(springY, [-0.5, 0.5], ["-9px", "9px"]);

  useEffect(() => {
    const handler = (event: MouseEvent) => {
      rawX.set(event.clientX / window.innerWidth - 0.5);
      rawY.set(event.clientY / window.innerHeight - 0.5);
    };

    window.addEventListener("mousemove", handler);
    return () => window.removeEventListener("mousemove", handler);
  }, [rawX, rawY]);

  useEffect(() => {
    if (!activeSlot) {
      goTo("intro");
    }
  }, [activeSlot, goTo]);

  if (!activeSlot) {
    return null;
  }

  function openRoom(roomId: string) {
    selectRoom(roomId);
    goTo("room");
  }

  function openSuspect(characterId: string) {
    selectSuspect(characterId);
    goTo("interrogation");
  }

  const evidenceThreshold = Math.min(3, activeSlot.evidence.length);
  const canAccuse = discoveredEvidence.length >= evidenceThreshold;

  return (
    <motion.div
      className="relative flex h-full flex-col gap-5 overflow-y-auto px-6 py-5"
      initial={{ opacity: 0, x: 30 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -30 }}
      transition={{ duration: 0.4 }}
    >
      <motion.div className="pointer-events-none absolute inset-0 overflow-hidden" style={{ x: bgX, y: bgY }}>
        <div
          className="absolute"
          style={{
            top: "10%",
            right: "5%",
            width: 240,
            height: 190,
            opacity: 0.04,
            backgroundImage:
              "repeating-linear-gradient(0deg, #D4A843 0px, #D4A843 1px, transparent 1px, transparent 18px), repeating-linear-gradient(90deg, #D4A843 0px, #D4A843 1px, transparent 1px, transparent 18px)",
          }}
        />
      </motion.div>

      <div className="relative z-10 flex items-center justify-between">
        <div>
          <div className="text-[10px] uppercase tracking-[4px] text-[#D4A843]">{activeSlot.title}</div>
          <div className="mt-0.5 text-xs italic text-[#445566]">{activeSlot.setting}</div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => goTo("evidence")}
            className="rounded px-3 py-1.5 text-[10px] uppercase tracking-wider"
            style={{
              border: "1px solid rgba(255,255,255,.1)",
              background: "rgba(255,255,255,.02)",
              color: discoveredEvidence.length > 0 ? "#C8D0DC" : "#334455",
            }}
          >
            Evidence ({discoveredEvidence.length})
          </button>
          {canAccuse && (
            <motion.button
              onClick={() => goTo("accusation")}
              className="rounded px-3 py-1.5 text-[10px] uppercase tracking-wider"
              style={{
                border: "1px solid rgba(212,168,67,.4)",
                background: "rgba(212,168,67,.08)",
                color: "#D4A843",
              }}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              whileHover={{ background: "rgba(212,168,67,.15)" }}
            >
              Accuse →
            </motion.button>
          )}
        </div>
      </div>

      <div className="relative z-10">
        <div className="mb-3 text-[9px] uppercase tracking-[4px] text-[#334455]">Locations To Search</div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {rooms.map((room) => {
            const searched = searchedRooms.includes(room.room_id);
            const foundCount = room.evidence_ids.filter((id) => discoveredEvidence.includes(id)).length;
            return (
              <motion.button
                key={room.room_id}
                onClick={() => openRoom(room.room_id)}
                className="border p-4 text-left"
                style={{
                  background: searched ? "rgba(255,255,255,.03)" : "rgba(255,255,255,.015)",
                  borderColor: searched ? "rgba(212,168,67,.2)" : "rgba(255,255,255,.06)",
                }}
                whileHover={{ borderColor: "rgba(212,168,67,.4)", background: "rgba(255,255,255,.04)" }}
              >
                <div className="text-xs font-semibold tracking-wide text-[#C8D0DC]">{room.name}</div>
                <div className="mt-1 text-[9px] leading-relaxed text-[#445566]">{room.description}</div>
                <div className="mt-2 text-[9px] tracking-wide text-[#D4A843]">
                  {searched ? `${foundCount} clues found` : "Search room →"}
                </div>
              </motion.button>
            );
          })}
        </div>
      </div>

      <div className="relative z-10">
        <div className="mb-3 text-[9px] uppercase tracking-[4px] text-[#334455]">Suspects To Interrogate</div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {activeSlot.suspects.map((suspect) => {
            const stress = suspectStress[suspect.character_id] ?? 0;
            const hasHistory = (interrogationHistories[suspect.character_id] ?? []).length > 0;

            return (
              <motion.button
                key={suspect.character_id}
                onClick={() => openSuspect(suspect.character_id)}
                className="border p-4 text-left"
                style={{
                  background: "rgba(255,255,255,.015)",
                  borderColor: hasHistory ? "rgba(212,168,67,.2)" : "rgba(255,255,255,.06)",
                }}
                whileHover={{ borderColor: "rgba(212,168,67,.4)", background: "rgba(255,255,255,.04)" }}
              >
                <div
                  className="mb-3 flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold"
                  style={{
                    background: "rgba(255,255,255,.05)",
                    border: "1px solid rgba(255,255,255,.08)",
                    color: "#8899AA",
                  }}
                >
                  {suspect.name
                    .split(" ")
                    .map((part) => part[0] ?? "")
                    .join("")
                    .slice(0, 2)
                    .toUpperCase()}
                </div>
                <div className="text-xs font-semibold text-[#C8D0DC]">{suspect.name}</div>
                <div className="mt-0.5 text-[9px] text-[#445566]">{suspect.occupation}</div>
                <div className="mt-1 text-[9px] italic leading-snug text-[#334455]">
                  {suspect.relationship_to_victim}
                </div>

                <div className="mt-2">
                  <div className="h-0.5 w-full overflow-hidden rounded-full bg-white/5">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${stress}%`,
                        background: stress >= 70 ? "#f44336" : stress >= 40 ? "#FF9800" : "#4CAF50",
                      }}
                    />
                  </div>
                </div>

                <div className="mt-2 text-[9px] uppercase tracking-wider text-[#334455]">Interrogate →</div>
              </motion.button>
            );
          })}
        </div>
      </div>

      {!canAccuse && (
        <div className="relative z-10 text-center text-[10px] italic text-[#2A3344]" style={{ fontFamily: "Georgia, serif" }}>
          Gather at least {evidenceThreshold} clues before making an accusation.
        </div>
      )}
    </motion.div>
  );
}
