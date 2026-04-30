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
    <div className="rounded-md border border-white/10 bg-black/10 px-3 py-2.5">
      <div className="text-[10px] uppercase tracking-[2px] text-[#6E7C92]">{label}</div>
      <div className="mt-1 text-sm leading-relaxed text-[#D6DCE7]" style={{ fontFamily: "Georgia, serif" }}>
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
    <aside className="flex h-full w-[34%] min-w-[260px] max-w-[380px] flex-shrink-0 flex-col overflow-hidden border-l border-white/10 bg-[#0B1526] text-white">
      <div className="sticky top-0 z-10 border-b border-white/10 bg-[#0B1526]/95 px-4 py-4 backdrop-blur">
        <div className="text-sm uppercase tracking-[3px] text-[#D4A843]">Evidence Board</div>
        <div className="mt-1 text-xs text-[#6E7C92]">Collected Clues</div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {!selectedEvidence ? (
          <div className="space-y-3 px-4 py-4">
            {discoveredItems.length === 0 ? (
              <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4 text-sm italic text-[#6E7C92]">
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
                  className="w-full rounded-lg border p-3 text-left transition-all duration-200 hover:border-white/20 hover:bg-white/[0.05]"
                  style={{
                    background: selected ? "rgba(212,168,67,.08)" : "rgba(255,255,255,.03)",
                    borderColor: status === "Key" ? "rgba(212,168,67,.22)" : selected ? "rgba(212,168,67,.28)" : "rgba(255,255,255,.1)",
                    boxShadow: selected ? "0 0 0 1px rgba(212,168,67,.1) inset" : "none",
                  }}
                  whileHover={{ y: -1 }}
                >
                  <div className="flex items-start gap-3">
                    <EvidenceImage evidence={item} size="compact" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm font-semibold leading-snug text-[#E8ECF3]" style={{ fontFamily: "Georgia, serif" }}>
                            {item.name}
                          </div>
                          <div className="mt-1 text-[11px] uppercase tracking-[2px] text-[#6E7C92]">
                            {evidenceCategory(item)}
                          </div>
                        </div>
                        <span className={`shrink-0 rounded-full border px-2 py-1 text-[10px] uppercase tracking-[1.8px] ${statusClass(status)}`}>
                          {status}
                        </span>
                      </div>

                      <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px]">
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
              className="mb-4 rounded-md border border-white/10 bg-white/[0.03] px-3 py-2 text-[11px] uppercase tracking-[2px] text-[#B7C2D3] transition-colors hover:bg-white/[0.06]"
            >
              Back
            </button>

            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
              <EvidenceImage evidence={selectedEvidence} size="detail" />

              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-lg font-semibold text-[#F1F3F7]" style={{ fontFamily: "Georgia, serif" }}>
                    {selectedEvidence.name}
                  </div>
                  <div className="mt-1 text-[11px] uppercase tracking-[2px] text-[#6E7C92]">
                    {evidenceCategory(selectedEvidence)}
                  </div>
                </div>
                <span className={`rounded-full border px-2 py-1 text-[10px] uppercase tracking-[1.8px] ${statusClass(statusFor(selectedEvidence, reviewedEvidenceIds.includes(selectedEvidence.evidence_id), selectedEvidenceIds.includes(selectedEvidence.evidence_id)))}`}>
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
                  className="rounded-md border border-white/10 bg-white/[0.03] px-3 py-2 text-[11px] uppercase tracking-[2px] transition-colors hover:bg-white/[0.06]"
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
                  className="rounded-md border border-white/10 bg-white/[0.03] px-3 py-2 text-[11px] uppercase tracking-[2px] transition-colors hover:bg-white/[0.06]"
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
