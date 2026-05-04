"use client";

import { motion } from "framer-motion";
import { useEffect } from "react";
import { useGameStore } from "@/lib/store";
import SuspectCard from "@/components/ui/SuspectCard";
import ManorBackdrop from "@/components/ui/atmosphere/ManorBackdrop";

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
      className="relative flex h-full min-h-0 flex-col overflow-hidden px-6 py-5"
      initial={{ opacity: 0, x: 30 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -30 }}
      transition={{ duration: 0.4 }}
    >
      <ManorBackdrop />

      <div className="relative z-10 flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto">
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <button
            onClick={() => goTo("cinematic")}
            className="rounded border px-3 py-1.5 text-label uppercase tracking-wider transition-colors hover:text-[#C8D0DC]"
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
              className="rounded px-3 py-1.5 text-label uppercase tracking-wider"
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
                className="rounded px-3 py-1.5 text-label uppercase tracking-wider"
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
          <div className="text-h1 uppercase tracking-[4px] text-[#D4A843]">{activeSlot.title}</div>
          <div className="mt-0.5 text-body italic text-[#445566]">{activeSlot.setting}</div>
        </div>

      </div>

      <div className="space-y-5">
      <div>
        <div className="mb-3 text-detail uppercase tracking-[4px] text-[#334455]">Locations To Search</div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {rooms.map((room) => {
            const searched = searchedRooms.includes(room.room_id);
            const foundCount = room.evidence_ids.filter((id) => discoveredEvidence.includes(id)).length;
            const totalCount = room.evidence_ids.length;
            const fullySearched = searched && foundCount >= totalCount;
            const evidenceRemains = searched && foundCount < totalCount;
            const newClueAvailable = !searched && totalCount > 0;
            const emptyRoom = totalCount === 0;
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
                  opacity: fullySearched || emptyRoom ? 0.82 : 1,
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
                <div className="absolute right-3 top-3 text-caption font-bold">
                  {emptyRoom ? (
                    <span className="text-[#556677]">•</span>
                  ) : fullySearched ? (
                    <span className="text-[#6FCF8C]">✓</span>
                  ) : evidenceRemains ? (
                    <span className="text-[#FF9800]">!</span>
                  ) : newClueAvailable ? (
                    <span className="text-[#D4A843]">!</span>
                  ) : null}
                </div>
                <div className="pr-6 text-h2 font-semibold tracking-wide text-[#C8D0DC]">{room.name}</div>
                <div className="mt-1 text-detail leading-relaxed text-[#445566]">{room.description}</div>
                <div
                  className="mt-2 text-detail tracking-wide"
                  style={{ color: emptyRoom ? "#556677" : totalCount > 1 ? "#F4E4A8" : "#D4A843" }}
                >
                  {emptyRoom ? "• Empty" : totalCount === 1 ? "• 1 clue" : `• ${totalCount} clues`}
                </div>
                <div className="mt-1 text-detail tracking-wide text-[#667788]">
                  {emptyRoom
                    ? searched
                      ? "No clues found"
                      : "May be a dead end"
                    : fullySearched
                      ? "Fully searched"
                      : evidenceRemains
                        ? `${totalCount - foundCount} clues remain`
                        : `${foundCount}/${totalCount} found →`}
                </div>
              </motion.button>
            );
          })}
        </div>
      </div>

      <div>
        <div className="mb-3 text-detail uppercase tracking-[4px] text-[#334455]">Suspects To Interrogate</div>
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
          {activeSlot.suspects.map((suspect) => {
            const stress = suspectStress[suspect.character_id] ?? 0;
            const history = interrogationHistories[suspect.character_id] ?? [];

            return (
              <SuspectCard
                key={suspect.character_id}
                suspect={suspect}
                stress={stress}
                messages={history}
                onInterrogate={() => openSuspect(suspect.character_id)}
              />
            );
          })}
        </div>
      </div>

      </div>

      {!canAccuse && (
        <div className="text-center text-label italic text-[#2A3344]" style={{ fontFamily: "Georgia, serif" }}>
          Gather at least {evidenceThreshold} clues before making an accusation.
        </div>
      )}
      </div>
    </motion.div>
  );
}
