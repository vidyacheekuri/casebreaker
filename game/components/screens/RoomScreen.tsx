"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { evidenceLinkedSuspectLabel, useGameStore } from "@/lib/store";
import EvidenceImage from "@/components/ui/EvidenceImage";
import RoomBackdrop from "@/components/ui/atmosphere/RoomBackdrop";

export default function RoomScreen() {
  const {
    activeSlot,
    rooms,
    selectedRoomId,
    goTo,
    searchRoom,
    searchedRooms,
  } = useGameStore();

  const [revealedEvidence, setRevealedEvidence] = useState<string[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedEvidence, setSelectedEvidence] = useState<string | null>(null);

  const room = selectedRoomId ? rooms.find((item) => item.room_id === selectedRoomId) : null;

  useEffect(() => {
    if (!activeSlot) {
      goTo("intro");
      return;
    }

    if (!selectedRoomId || !room) {
      goTo("manor");
    }
  }, [activeSlot, goTo, room, selectedRoomId]);

  if (!activeSlot) {
    return null;
  }

  if (!selectedRoomId) {
    return null;
  }

  if (!room) {
    return null;
  }

  let dustSeed = 0;
  for (let i = 0; i < room.room_id.length; i += 1) {
    dustSeed += room.room_id.charCodeAt(i);
  }

  const roomId = room.room_id;
  const alreadySearched = searchedRooms.includes(selectedRoomId);
  const roomEvidence = activeSlot.evidence.filter((evidence) =>
    room.evidence_ids.includes(evidence.evidence_id)
  );

  function doSearch() {
    setSearching(true);
    window.setTimeout(() => {
      const evidenceIds = roomEvidence.map((evidence) => evidence.evidence_id);
      setRevealedEvidence(evidenceIds);
      searchRoom(roomId, evidenceIds);
      setSearching(false);
    }, 1100);
  }

  return (
    <motion.div
      className="relative flex h-full min-h-0 flex-col overflow-hidden px-6 py-5"
      initial={{ opacity: 0, x: 30 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -30 }}
      transition={{ duration: 0.3 }}
    >
      <RoomBackdrop roomSeed={dustSeed} />
      <div className="relative z-10 flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto">
      <button
        onClick={() => goTo("manor")}
        className="w-fit text-label uppercase tracking-wider text-[#445566] transition-colors hover:text-[#C8D0DC]"
      >
        ← Back to Manor
      </button>

      <div>
        <div className="mb-1 text-h1 uppercase tracking-[4px] text-[#D4A843]">{room.name}</div>
        <p className="text-body leading-relaxed text-[#667788]" style={{ fontFamily: "Georgia, serif" }}>
          {room.description}
        </p>
      </div>

      {!alreadySearched && revealedEvidence.length === 0 && (
        <div className="flex flex-1 flex-col items-center justify-center gap-4">
          <AnimatePresence mode="wait">
            {searching ? (
              <motion.div
                key="searching"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex flex-col items-center gap-3"
              >
                <div
                  className="h-8 w-8 rounded-full border-2 border-[#334455] border-t-[#D4A843]"
                  style={{ animation: "spin 1s linear infinite" }}
                />
                <div className="text-caption italic tracking-wider text-[#445566]">Searching this location...</div>
              </motion.div>
            ) : (
              <motion.button
                key="search-btn"
                onClick={doSearch}
                className="px-8 py-4 text-caption uppercase tracking-[3px]"
                style={{
                  background: "rgba(212,168,67,.08)",
                  border: "1px solid rgba(212,168,67,.3)",
                  color: "#D4A843",
                  fontFamily: "Georgia, serif",
                }}
                whileHover={{ background: "rgba(212,168,67,.15)" }}
                whileTap={{ scale: 0.97 }}
              >
                Search This Location
              </motion.button>
            )}
          </AnimatePresence>
        </div>
      )}

      {(alreadySearched || revealedEvidence.length > 0) && (
        <div className="flex flex-1 flex-col gap-4">
          {roomEvidence.length === 0 ? (
            <div className="py-20 text-center" style={{ fontFamily: "Georgia, serif" }}>
              <p className="text-body text-[#556677]">This room yields no clues.</p>
              <p className="mt-2 text-detail text-[#334455]">The {room.name} appears unremarkable.</p>
            </div>
          ) : (
            <>
              <div className="text-detail uppercase tracking-[4px] text-[#334455]">Clues Discovered</div>
              <div className={roomEvidence.length > 1 ? "grid grid-cols-1 gap-4 xl:grid-cols-2" : "flex flex-col gap-2"}>
                {roomEvidence.map((evidence) => {
                  const isNew = revealedEvidence.includes(evidence.evidence_id);
                  const isExpanded = selectedEvidence === evidence.evidence_id;

                  return (
                    <motion.div
                      key={evidence.evidence_id}
                      initial={isNew ? { opacity: 0, y: 8 } : undefined}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.35 }}
                    >
                      <button
                        onClick={() =>
                          setSelectedEvidence(
                            selectedEvidence === evidence.evidence_id ? null : evidence.evidence_id
                          )
                        }
                        className="w-full border p-4 text-left"
                        style={{
                          background: isExpanded ? "rgba(212,168,67,.06)" : "rgba(255,255,255,.02)",
                          borderColor: isExpanded ? "rgba(212,168,67,.4)" : "rgba(255,255,255,.08)",
                        }}
                      >
                        <div className="flex flex-col items-stretch gap-5 sm:flex-row sm:items-start">
                          <div className="flex justify-center sm:block sm:shrink-0">
                            <EvidenceImage evidence={evidence} size="room" />
                          </div>
                          <div className="min-w-0 flex-1 sm:pt-1">
                            <div className="flex items-center justify-between gap-3">
                              <div className="text-h2 font-semibold tracking-wide text-[#C8D0DC]">{evidence.name}</div>
                              <div className="text-label text-[#D4A843]">{isExpanded ? "▲" : "▼"}</div>
                            </div>
                            <div className="mt-1 text-detail uppercase tracking-wider text-[#667788]">
                              {evidence.location}
                            </div>
                            {!isExpanded ? (
                              <div className="mt-4 text-body text-[#C8D0DC]" style={{ fontFamily: "Georgia, serif" }}>
                                You discover: {evidence.name}
                              </div>
                            ) : null}

                            <AnimatePresence>
                              {isExpanded && (
                                <motion.div
                                  initial={{ opacity: 0, x: -8 }}
                                  animate={{ opacity: 1, x: 0 }}
                                  exit={{ opacity: 0, x: -8 }}
                                  transition={{ duration: 0.2 }}
                                  className="mt-5 max-w-4xl"
                                >
                                  <p
                                    className="text-body leading-relaxed text-[#8899AA]"
                                    style={{ fontFamily: "Georgia, serif" }}
                                  >
                                    {evidence.description}
                                  </p>
                                  <div className="mt-4 text-detail uppercase tracking-wider text-[#D4A843]">
                                    Linked suspect: {evidenceLinkedSuspectLabel(activeSlot, evidence)}
                                    {evidence.is_red_herring ? " (unverified)" : ""}
                                  </div>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                        </div>
                      </button>
                    </motion.div>
                  );
                })}
              </div>
            </>
          )}

          <button
            onClick={() => goTo("manor")}
            className="mt-auto text-label uppercase tracking-[3px] text-[#445566] transition-colors hover:text-[#C8D0DC]"
          >
            ← Return to Manor
          </button>
        </div>
      )}
      </div>
    </motion.div>
  );
}
