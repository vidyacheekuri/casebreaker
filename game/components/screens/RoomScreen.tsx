"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useGameStore } from "@/lib/store";

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
      className="flex h-full flex-col gap-5 px-6 py-5"
      initial={{ opacity: 0, x: 30 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -30 }}
      transition={{ duration: 0.3 }}
    >
      <button
        onClick={() => goTo("manor")}
        className="w-fit text-[10px] uppercase tracking-wider text-[#445566] transition-colors hover:text-[#C8D0DC]"
      >
        ← Back to Investigation
      </button>

      <div>
        <div className="mb-1 text-[10px] uppercase tracking-[4px] text-[#D4A843]">{room.name}</div>
        <p className="text-sm leading-relaxed text-[#667788]" style={{ fontFamily: "Georgia, serif" }}>
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
                <div className="text-xs italic tracking-wider text-[#445566]">Searching this location...</div>
              </motion.div>
            ) : (
              <motion.button
                key="search-btn"
                onClick={doSearch}
                className="px-8 py-4 text-sm uppercase tracking-[3px]"
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
            <div className="text-sm italic text-[#445566]" style={{ fontFamily: "Georgia, serif" }}>
              No useful clues were found here.
            </div>
          ) : (
            <>
              <div className="text-[9px] uppercase tracking-[4px] text-[#334455]">Clues Discovered</div>
              <div className="flex flex-col gap-2">
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
                        <div className="flex items-center justify-between">
                          <div className="text-xs font-semibold tracking-wide text-[#C8D0DC]">{evidence.name}</div>
                          <div className="text-[10px] text-[#D4A843]">{isExpanded ? "▲" : "▼"}</div>
                        </div>

                        <AnimatePresence>
                          {isExpanded && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: "auto", opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.2 }}
                              className="overflow-hidden"
                            >
                              <p
                                className="mt-2 text-xs leading-relaxed text-[#8899AA]"
                                style={{ fontFamily: "Georgia, serif" }}
                              >
                                {evidence.description}
                              </p>
                              <div className="mt-2 text-[9px] uppercase tracking-wider text-[#D4A843]">
                                Implicates: {evidence.implicates === "none" ? "Unknown" : evidence.implicates}
                                {evidence.is_red_herring ? " (unverified)" : ""}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </button>
                    </motion.div>
                  );
                })}
              </div>
            </>
          )}

          <button
            onClick={() => goTo("manor")}
            className="mt-auto text-[10px] uppercase tracking-[3px] text-[#445566] transition-colors hover:text-[#C8D0DC]"
          >
            ← Return to Investigation
          </button>
        </div>
      )}
    </motion.div>
  );
}
