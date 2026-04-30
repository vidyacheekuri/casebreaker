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

      <div className="relative z-10 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <button
            onClick={() => goTo("cinematic")}
            className="rounded border px-3 py-1.5 text-[10px] uppercase tracking-wider transition-colors hover:text-[#C8D0DC]"
            style={{
              borderColor: "rgba(255,255,255,.1)",
              background: "rgba(255,255,255,.02)",
              color: "#445566",
            }}
          >
            ← Case File
          </button>
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

        <div>
          <div className="text-[10px] uppercase tracking-[4px] text-[#D4A843]">{activeSlot.title}</div>
          <div className="mt-0.5 text-xs italic text-[#445566]">{activeSlot.setting}</div>
        </div>

      </div>

      <div className="relative z-10 space-y-5">
      <div>
        <div className="mb-3 text-[9px] uppercase tracking-[4px] text-[#334455]">Locations To Search</div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {rooms.map((room) => {
            const searched = searchedRooms.includes(room.room_id);
            const foundCount = room.evidence_ids.filter((id) => discoveredEvidence.includes(id)).length;
            const totalCount = room.evidence_ids.length;
            const fullySearched = searched && foundCount >= totalCount;
            const evidenceRemains = searched && foundCount < totalCount;
            const newClueAvailable = !searched && totalCount > 0;
            return (
              <motion.button
                key={room.room_id}
                onClick={() => openRoom(room.room_id)}
                className="relative border p-4 text-left"
                style={{
                  background: fullySearched
                    ? "rgba(255,255,255,.03)"
                    : newClueAvailable
                      ? "rgba(212,168,67,.035)"
                      : "rgba(255,255,255,.015)",
                  borderColor: fullySearched
                    ? "rgba(90,190,120,.28)"
                    : evidenceRemains
                      ? "rgba(255,152,0,.34)"
                      : newClueAvailable
                        ? "rgba(212,168,67,.34)"
                        : "rgba(255,255,255,.06)",
                  boxShadow: fullySearched
                    ? "inset 0 1px 0 rgba(255,255,255,.025)"
                    : evidenceRemains
                      ? "0 10px 26px rgba(0,0,0,.18), 0 0 14px rgba(255,152,0,.06), inset 0 1px 0 rgba(255,255,255,.035)"
                      : newClueAvailable
                        ? "0 14px 34px rgba(0,0,0,.24), 0 0 20px rgba(212,168,67,.10), inset 0 1px 0 rgba(255,255,255,.04)"
                        : "0 8px 20px rgba(0,0,0,.14)",
                  opacity: fullySearched ? 0.82 : 1,
                }}
                whileHover={{
                  y: fullySearched ? 0 : -2,
                  borderColor: "rgba(212,168,67,.4)",
                  background: fullySearched ? "rgba(255,255,255,.035)" : "rgba(255,255,255,.04)",
                  boxShadow: fullySearched
                    ? "inset 0 1px 0 rgba(255,255,255,.035)"
                    : "0 18px 40px rgba(0,0,0,.28), 0 0 22px rgba(212,168,67,.12)",
                }}
              >
                <div className="absolute right-3 top-3 text-xs font-bold">
                  {fullySearched ? (
                    <span className="text-[#6FCF8C]">✓</span>
                  ) : evidenceRemains ? (
                    <span className="text-[#FF9800]">!</span>
                  ) : newClueAvailable ? (
                    <span className="text-[#D4A843]">!</span>
                  ) : null}
                </div>
                <div className="pr-6 text-xs font-semibold tracking-wide text-[#C8D0DC]">{room.name}</div>
                <div className="mt-1 text-[9px] leading-relaxed text-[#445566]">{room.description}</div>
                <div className="mt-2 text-[9px] tracking-wide text-[#D4A843]">
                  {foundCount}/{totalCount} clues found
                </div>
                <div className="mt-1 text-[9px] tracking-wide text-[#667788]">
                  {fullySearched
                    ? "Fully searched"
                    : evidenceRemains
                      ? `${totalCount - foundCount} clues remain`
                      : "New clue available →"}
                </div>
              </motion.button>
            );
          })}
        </div>
      </div>

      <div>
        <div className="mb-3 text-[9px] uppercase tracking-[4px] text-[#334455]">Suspects To Interrogate</div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {activeSlot.suspects.map((suspect) => {
            const stress = suspectStress[suspect.character_id] ?? 0;
            const history = interrogationHistories[suspect.character_id] ?? [];
            const hasHistory = history.length > 0;
            const latestTone = [...history].reverse().find((message) => message.role === "assistant")?.tone;
            const consistencyLabel = latestTone
              ? ["evasive", "defensive", "nervous", "hostile", "guarded"].includes(latestTone.toLowerCase())
                ? "Check statement"
                : "Stable"
              : "No statement";
            const stressLabel = stress >= 70 ? "High stress" : stress >= 40 ? "Uneasy" : "Calm";

            return (
              <motion.button
                key={suspect.character_id}
                onClick={() => openSuspect(suspect.character_id)}
                className="group border p-4 text-left transition-all duration-200"
                style={{
                  background: "rgba(255,255,255,.015)",
                  borderColor: hasHistory ? "rgba(212,168,67,.2)" : "rgba(255,255,255,.06)",
                }}
                whileHover={{
                  y: -2,
                  borderColor: "rgba(212,168,67,.48)",
                  background: "rgba(212,168,67,.045)",
                  boxShadow: "0 14px 35px rgba(0,0,0,.22), 0 0 18px rgba(212,168,67,.08)",
                }}
                whileFocus={{
                  borderColor: "rgba(212,168,67,.48)",
                  background: "rgba(212,168,67,.045)",
                }}
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
                <div className="mt-3 flex flex-wrap gap-1.5">
                  <span
                    className="rounded-full border px-2 py-0.5 text-[8px] uppercase tracking-[1.4px]"
                    style={{
                      borderColor: hasHistory ? "rgba(90,190,120,.28)" : "rgba(255,255,255,.08)",
                      background: hasHistory ? "rgba(90,190,120,.08)" : "rgba(255,255,255,.025)",
                      color: hasHistory ? "#6FCF8C" : "#526174",
                    }}
                  >
                    {hasHistory ? "Interrogated" : "Not questioned"}
                  </span>
                  <span className="rounded-full border border-white/10 bg-white/[0.025] px-2 py-0.5 text-[8px] uppercase tracking-[1.4px] text-[#667788]">
                    {stressLabel}
                  </span>
                  <span
                    className="rounded-full border px-2 py-0.5 text-[8px] uppercase tracking-[1.4px]"
                    style={{
                      borderColor: consistencyLabel === "Check statement" ? "rgba(255,152,0,.30)" : "rgba(255,255,255,.08)",
                      background: consistencyLabel === "Check statement" ? "rgba(255,152,0,.08)" : "rgba(255,255,255,.025)",
                      color: consistencyLabel === "Check statement" ? "#FFB35C" : "#667788",
                    }}
                  >
                    {consistencyLabel}
                  </span>
                </div>

                <div className="mt-3">
                  <div className="mb-1 flex items-center justify-between text-[8px] uppercase tracking-[1.6px] text-[#334455]">
                    <span>Stress</span>
                    <span>{Math.round(stress)}%</span>
                  </div>
                  <div className="h-1 w-full overflow-hidden rounded-full bg-white/5">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${stress}%`,
                        background: stress >= 70 ? "#f44336" : stress >= 40 ? "#FF9800" : "#4CAF50",
                      }}
                    />
                  </div>
                </div>

                <div className="mt-3 text-[9px] uppercase tracking-wider text-[#D4A843] opacity-0 translate-y-1 transition-all duration-200 group-hover:translate-y-0 group-hover:opacity-100 group-focus:translate-y-0 group-focus:opacity-100">
                  Interrogate →
                </div>
              </motion.button>
            );
          })}
        </div>
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
