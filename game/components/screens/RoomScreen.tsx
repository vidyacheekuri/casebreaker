"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useGameStore } from "@/lib/store";
import { getRoom, getEvidence } from "@/lib/cases/harlow-manor";
import type { EvidenceId } from "@/lib/cases/harlow-manor";

export default function RoomScreen() {
  const { selectedRoom, goTo, searchRoom, searchedRooms, discoveredEvidence } = useGameStore();
  const [revealed, setRevealed] = useState<EvidenceId[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedEvidence, setSelectedEvidence] = useState<EvidenceId | null>(null);

  if (!selectedRoom) {
    goTo("manor");
    return null;
  }

  const room = getRoom(selectedRoom);
  const alreadySearched = searchedRooms.includes(selectedRoom);
  const evidenceInRoom = room.evidence;

  function doSearch() {
    setSearching(true);
    setTimeout(() => {
      setRevealed(evidenceInRoom);
      searchRoom(selectedRoom!, evidenceInRoom);
      setSearching(false);
    }, 1200);
  }

  return (
    <motion.div
      className="flex flex-col h-full px-6 py-5 gap-5"
      initial={{ opacity: 0, x: 30 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -30 }}
      transition={{ duration: 0.3 }}
    >
      {/* Back */}
      <button
        onClick={() => goTo("manor")}
        className="flex items-center gap-2 text-[10px] tracking-wider uppercase text-[#445566] hover:text-[#C8D0DC] transition-colors w-fit"
      >
        ← Back to Manor
      </button>

      {/* Room Header */}
      <div>
        <div className="text-[10px] tracking-[4px] uppercase text-[#D4A843] mb-1">
          {room.name}
        </div>
        <p
          className="text-sm text-[#667788] leading-relaxed"
          style={{ fontFamily: "Georgia, serif" }}
        >
          {room.description}
        </p>
      </div>

      {/* Search action */}
      {!alreadySearched && revealed.length === 0 && (
        <div className="flex flex-col items-center justify-center flex-1 gap-4">
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
                <div className="text-xs text-[#445566] tracking-wider italic">Searching the room...</div>
              </motion.div>
            ) : (
              <motion.button
                key="search-btn"
                onClick={doSearch}
                className="px-8 py-4 text-sm tracking-[3px] uppercase transition-all"
                style={{
                  background: "rgba(212,168,67,.08)",
                  border: "1px solid rgba(212,168,67,.3)",
                  color: "#D4A843",
                  fontFamily: "Georgia, serif",
                }}
                whileHover={{ background: "rgba(212,168,67,.15)" }}
                whileTap={{ scale: 0.97 }}
              >
                Search the Room
              </motion.button>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* Evidence found */}
      {(alreadySearched || revealed.length > 0) && (
        <div className="flex-1 flex flex-col gap-4">
          {evidenceInRoom.length === 0 ? (
            <div className="text-sm text-[#445566] italic" style={{ fontFamily: "Georgia, serif" }}>
              Nothing of significance was found in this room.
            </div>
          ) : (
            <>
              <div className="text-[9px] tracking-[4px] uppercase text-[#334455]">
                Evidence Discovered
              </div>
              <div className="flex flex-col gap-2">
                {evidenceInRoom.map((evId) => {
                  const ev = getEvidence(evId);
                  const isNew = revealed.includes(evId);
                  return (
                    <motion.div
                      key={evId}
                      initial={isNew ? { opacity: 0, y: 8 } : {}}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.4 }}
                    >
                      <button
                        onClick={() => setSelectedEvidence(selectedEvidence === evId ? null : evId)}
                        className="w-full text-left p-4 border transition-all"
                        style={{
                          background: selectedEvidence === evId ? "rgba(212,168,67,.06)" : "rgba(255,255,255,.02)",
                          borderColor: selectedEvidence === evId ? "rgba(212,168,67,.4)" : "rgba(255,255,255,.08)",
                        }}
                      >
                        <div className="flex items-center justify-between">
                          <div className="text-xs font-semibold text-[#C8D0DC] tracking-wide">{ev.name}</div>
                          <div className="text-[10px] text-[#D4A843]">{selectedEvidence === evId ? "▲" : "▼"}</div>
                        </div>
                        <AnimatePresence>
                          {selectedEvidence === evId && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: "auto", opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.2 }}
                              className="overflow-hidden"
                            >
                              <p
                                className="text-xs text-[#8899AA] mt-2 leading-relaxed"
                                style={{ fontFamily: "Georgia, serif" }}
                              >
                                {ev.description}
                              </p>
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
            className="text-[10px] tracking-[3px] uppercase text-[#445566] hover:text-[#C8D0DC] transition-colors mt-auto"
          >
            ← Return to Manor
          </button>
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </motion.div>
  );
}
