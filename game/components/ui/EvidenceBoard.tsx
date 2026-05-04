"use client";

import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { evidenceLinkedSuspectLabel, useGameStore } from "@/lib/store";
import type { EvidenceDto } from "@/lib/backend-types";
import EvidenceImage from "@/components/ui/EvidenceImage";

function evidenceCategory(item: EvidenceDto): string {
  if (item.is_red_herring) return "Unverified Lead";
  if (item.implicates && item.implicates !== "none") return "Suspect Link";
  return "Physical Clue";
}

function statusFor(item: EvidenceDto, reviewed: boolean, selected: boolean): "Key" | "Reviewed" | "Selected" | "New" {
  if (!item.is_red_herring && item.implicates !== "none") return "Key";
  if (selected) return "Selected";
  if (reviewed) return "Reviewed";
  return "New";
}

function statusClass(status: ReturnType<typeof statusFor>): string {
  if (status === "Key") return "border-[#5B4B25] bg-[#2B2414] text-[#D8BC79]";
  if (status === "Selected") return "border-[#5B4B25] bg-[#2B2414]/70 text-[#D4A843]";
  if (status === "Reviewed") return "border-white/10 bg-white/5 text-[#B3BECF]";
  return "border-white/10 bg-[#1B2940] text-[#8FB2D8]";
}

function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="rounded-md border border-white/10 bg-[rgba(7,14,26,0.5)] px-3 py-2.5 backdrop-blur-md">
      <div className="text-label uppercase tracking-[2px] text-[#6E7C92]">{label}</div>
      <div className="mt-1 text-body leading-relaxed text-[#D6DCE7]" style={{ fontFamily: "Georgia, serif" }}>
        {children}
      </div>
    </div>
  );
}

export default function EvidenceBoard() {
  const {
    activeSlot,
    discoveredEvidence,
    selectedEvidenceIds,
    reviewedEvidenceIds,
    accusationEvidenceIds,
    selectedSuspectId,
    toggleEvidenceSelection,
    markEvidenceReviewed,
    setEvidenceForAccusation,
  } = useGameStore();
  const [selectedEvidenceId, setSelectedEvidenceId] = useState<string | null>(null);

  const discoveredItems = useMemo(() => {
    if (!activeSlot) return [];
    const byId = new Map(activeSlot.evidence.map((item) => [item.evidence_id, item]));
    return discoveredEvidence
      .map((id) => byId.get(id))
      .filter((item): item is EvidenceDto => Boolean(item));
  }, [activeSlot, discoveredEvidence]);

  const selectedEvidence =
    selectedEvidenceId != null
      ? discoveredItems.find((item) => item.evidence_id === selectedEvidenceId) ?? null
      : null;

  return (
    <aside className="flex h-full w-[28%] min-w-[240px] max-w-[330px] flex-shrink-0 flex-col overflow-hidden border-l border-[#2a2a3a] bg-[#05070c]/92 font-mono text-white shadow-[-14px_0_36px_rgba(0,0,0,0.35)] backdrop-blur-md">
      <div className="sticky top-0 z-10 border-b border-[#2a2a3a] bg-[#060910]/95 px-4 py-3 backdrop-blur-md">
        <div className="text-label uppercase tracking-[3px] text-[#e8e8e8]">Evidence</div>
        <div className="mt-1 text-[10px] text-[#7d8796]">Collected clues</div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {!selectedEvidence ? (
          <div className="space-y-3 px-3 py-3">
            {discoveredItems.length === 0 ? (
              <div className="border border-[#2a2a3a] bg-[#0a0e1a]/85 p-4 text-body italic text-[#8a96a6] backdrop-blur-md shadow-[0_8px_28px_rgba(0,0,0,0.28)]">
                Search the manor to collect evidence for interrogation and accusation.
              </div>
            ) : null}

            {discoveredItems.map((item) => {
              const reviewed = reviewedEvidenceIds.includes(item.evidence_id);
              const selected = selectedEvidenceIds.includes(item.evidence_id);
              const status = statusFor(item, reviewed, selected);
              const suspectLinked =
                selectedSuspectId != null &&
                item.implicates.toLowerCase().includes(selectedSuspectId.toLowerCase());

              return (
                <motion.button
                  key={item.evidence_id}
                  type="button"
                  onClick={() => {
                    setSelectedEvidenceId(item.evidence_id);
                    markEvidenceReviewed(item.evidence_id);
                  }}
                  className="w-full border border-[#2a2a3a] p-3 text-left opacity-85 backdrop-blur-md transition-all duration-300 hover:border-[#1e3a5f] hover:opacity-100 hover:shadow-[0_10px_28px_rgba(30,58,95,0.12)]"
                  style={{
                    background:
                      selected || status === "Key"
                        ? "linear-gradient(135deg, rgba(184,134,11,.12), rgba(10,14,26,0.75))"
                        : "rgba(10,14,26,0.72)",
                    borderColor: status === "Key" ? "rgba(184,134,11,.35)" : selected ? "rgba(30,58,95,.7)" : undefined,
                    boxShadow: selected ? "0 0 0 1px rgba(30,58,95,.35) inset" : undefined,
                  }}
                  whileHover={{ y: -1 }}
                >
                  <div className="flex items-start gap-3">
                    <EvidenceImage evidence={item} size="compact" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-xs font-semibold leading-snug text-[#C7D0DC]" style={{ fontFamily: "Georgia, serif" }}>
                            {item.name}
                          </div>
                          <div className="mt-1 text-caption uppercase tracking-[2px] text-[#6E7C92]">
                            {evidenceCategory(item)}
                          </div>
                        </div>
                        <span className={`shrink-0 rounded-full border px-2 py-1 text-label uppercase tracking-[1.8px] ${statusClass(status)}`}>
                          {status}
                        </span>
                      </div>

                      <div className="mt-3 flex flex-wrap items-center gap-2 text-caption">
                        <span className="rounded-full border border-white/10 bg-white/[0.03] px-2 py-0.5 text-[#93A4BA]">
                          {evidenceLinkedSuspectLabel(activeSlot, item)}
                        </span>
                        {suspectLinked ? (
                          <span className="rounded-full border border-[#5B3B30] bg-[#2A1715] px-2 py-0.5 text-[#D9A08E]">
                            Contradiction ready
                          </span>
                        ) : null}
                        {accusationEvidenceIds.includes(item.evidence_id) ? (
                          <span className="rounded-full border border-[#5B4B25] bg-[#2B2414] px-2 py-0.5 text-[#D8BC79]">
                            Accusation
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </motion.button>
              );
            })}
          </div>
        ) : (
          <div className="px-4 py-4">
            <button
              type="button"
              onClick={() => setSelectedEvidenceId(null)}
              className="mb-4 rounded-md border border-white/10 bg-[rgba(7,14,26,0.55)] px-3 py-2 text-caption uppercase tracking-[2px] text-[#B7C2D3] backdrop-blur-md transition-all duration-300 hover:border-[#D4A843]/25 hover:shadow-[0_8px_28px_rgba(212,168,67,0.1)]"
            >
              Back
            </button>

            <div className="border border-[#2a2a3a] bg-[#0a0e1a]/88 p-4 backdrop-blur-md shadow-[0_8px_32px_rgba(0,0,0,0.35)] transition-shadow duration-300">
              <EvidenceImage evidence={selectedEvidence} size="detail" />

              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-h2 font-semibold text-[#F1F3F7]" style={{ fontFamily: "Georgia, serif" }}>
                    {selectedEvidence.name}
                  </div>
                  <div className="mt-1 text-caption uppercase tracking-[2px] text-[#6E7C92]">
                    {evidenceCategory(selectedEvidence)}
                  </div>
                </div>
                <span className={`rounded-full border px-2 py-1 text-label uppercase tracking-[1.8px] ${statusClass(statusFor(selectedEvidence, reviewedEvidenceIds.includes(selectedEvidence.evidence_id), selectedEvidenceIds.includes(selectedEvidence.evidence_id)))}`}>
                  {statusFor(selectedEvidence, reviewedEvidenceIds.includes(selectedEvidence.evidence_id), selectedEvidenceIds.includes(selectedEvidence.evidence_id))}
                </span>
              </div>

              <div className="mt-4 grid gap-3">
                <DetailRow label="Description">{selectedEvidence.description}</DetailRow>
                <DetailRow label="Where Found">{selectedEvidence.location}</DetailRow>
                <DetailRow label="Related Suspect">
                  {evidenceLinkedSuspectLabel(activeSlot, selectedEvidence)}
                </DetailRow>
                <DetailRow label="Why It Matters">
                  {selectedEvidence.implicates !== "none"
                    ? "This clue points toward a suspect and can be used to pressure their account."
                    : "This clue helps establish the scene, but it may not identify the culprit on its own."}
                </DetailRow>
                <DetailRow label="Contradiction Notes">
                  {selectedEvidence.is_red_herring
                    ? "This may distract from the real pattern. Verify it before accusing."
                    : "Use this during interrogation if the suspect gives an alibi or motive that does not line up."}
                </DetailRow>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => toggleEvidenceSelection(selectedEvidence.evidence_id)}
                  className="rounded-md border border-white/10 bg-[rgba(7,14,26,0.5)] px-3 py-2 text-caption uppercase tracking-[2px] backdrop-blur-md transition-all duration-300 hover:border-[#D4A843]/30 hover:shadow-[0_8px_24px_rgba(212,168,67,0.12)]"
                  style={{
                    color: selectedEvidenceIds.includes(selectedEvidence.evidence_id) ? "#D4A843" : "#B7C2D3",
                  }}
                >
                  {selectedEvidenceIds.includes(selectedEvidence.evidence_id) ? "Selected" : "Select Evidence"}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setEvidenceForAccusation(
                      selectedEvidence.evidence_id,
                      !accusationEvidenceIds.includes(selectedEvidence.evidence_id)
                    )
                  }
                  className="rounded-md border border-white/10 bg-[rgba(7,14,26,0.5)] px-3 py-2 text-caption uppercase tracking-[2px] backdrop-blur-md transition-all duration-300 hover:border-[#D4A843]/30 hover:shadow-[0_8px_24px_rgba(212,168,67,0.12)]"
                  style={{
                    color: accusationEvidenceIds.includes(selectedEvidence.evidence_id) ? "#D4A843" : "#B7C2D3",
                  }}
                >
                  {accusationEvidenceIds.includes(selectedEvidence.evidence_id)
                    ? "Remove from Accusation"
                    : "Use in Accusation"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
