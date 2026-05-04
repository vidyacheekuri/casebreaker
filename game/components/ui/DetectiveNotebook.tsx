"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { DailySlotDto, EvidenceDto, SuspectDto } from "@/lib/backend-types";
import { evidenceLinkedSuspectLabel, type Message, useGameStore } from "@/lib/store";
import EvidenceImage from "@/components/ui/EvidenceImage";

const STORAGE_PREFIX = "casebreaker:detective-notebook";

type NotebookPersisted = {
  notes: string;
  pinnedEvidenceIds: string[];
};

function loadPersisted(slotId: string): NotebookPersisted {
  if (typeof window === "undefined") {
    return { notes: "", pinnedEvidenceIds: [] };
  }
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}:${slotId}`);
    if (!raw) return { notes: "", pinnedEvidenceIds: [] };
    const p = JSON.parse(raw) as Partial<NotebookPersisted>;
    return {
      notes: typeof p.notes === "string" ? p.notes : "",
      pinnedEvidenceIds: Array.isArray(p.pinnedEvidenceIds) ? p.pinnedEvidenceIds : [],
    };
  } catch {
    return { notes: "", pinnedEvidenceIds: [] };
  }
}

function savePersisted(slotId: string, data: NotebookPersisted) {
  try {
    localStorage.setItem(`${STORAGE_PREFIX}:${slotId}`, JSON.stringify(data));
  } catch {
    /* quota */
  }
}

function implicatesSuspect(ev: EvidenceDto, suspect: SuspectDto): boolean {
  const im = ev.implicates.trim().toLowerCase();
  if (!im || im === "none") return false;
  const id = suspect.character_id.toLowerCase();
  const n = suspect.name.toLowerCase();
  return im.includes(id) || im.includes(n);
}

const SLIPPERY = new Set(["evasive", "defensive", "guarded", "nervous", "hostile"]);

function assistantSnippetsForEvidence(evidence: EvidenceDto, messages: Message[]): { tone?: string; excerpt: string }[] {
  const needle = evidence.name.trim().toLowerCase();
  if (needle.length < 3) return [];
  const out: { tone?: string; excerpt: string }[] = [];
  for (const m of messages) {
    if (m.role !== "assistant") continue;
    const c = m.content.toLowerCase();
    if (!c.includes(needle.slice(0, Math.min(needle.length, 40)))) continue;
    const slippery = m.tone && SLIPPERY.has(m.tone.toLowerCase());
    out.push({
      tone: m.tone,
      excerpt: m.content.length > 220 ? `${m.content.slice(0, 220)}…` : m.content,
    });
    if (out.length >= 6) break;
  }
  return out;
}

type SectionId = "summary" | "suspects" | "evidence" | "notes" | "timeline";

const SECTIONS: { id: SectionId; label: string }[] = [
  { id: "summary", label: "Case" },
  { id: "suspects", label: "Suspects" },
  { id: "evidence", label: "Evidence" },
  { id: "notes", label: "Notes" },
  { id: "timeline", label: "Timeline" },
];

export default function DetectiveNotebook() {
  const activeSlot = useGameStore((s) => s.activeSlot);
  const screen = useGameStore((s) => s.screen);
  const discoveredEvidence = useGameStore((s) => s.discoveredEvidence);
  const suspectStress = useGameStore((s) => s.suspectStress);
  const interrogationHistories = useGameStore((s) => s.interrogationHistories);
  const toggleEvidenceSelection = useGameStore((s) => s.toggleEvidenceSelection);
  const selectedEvidenceIds = useGameStore((s) => s.selectedEvidenceIds);

  const [open, setOpen] = useState(false);
  const [section, setSection] = useState<SectionId>("summary");
  const [notes, setNotes] = useState("");
  const [pinnedIds, setPinnedIds] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [focusEvidence, setFocusEvidence] = useState<EvidenceDto | null>(null);
  const hydratedRef = useRef<string | null>(null);
  const notesDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const slotId = activeSlot?.slot_id ?? "";

  useEffect(() => {
    if (!slotId || hydratedRef.current === slotId) {
      if (!slotId) {
        hydratedRef.current = null;
        setNotes("");
        setPinnedIds([]);
      }
      return;
    }
    hydratedRef.current = slotId;
    const p = loadPersisted(slotId);
    setNotes(p.notes);
    setPinnedIds(p.pinnedEvidenceIds);
  }, [slotId]);

  const persist = useCallback(
    (next: Partial<NotebookPersisted>) => {
      if (!slotId) return;
      const merged: NotebookPersisted = {
        notes: next.notes ?? notes,
        pinnedEvidenceIds: next.pinnedEvidenceIds ?? pinnedIds,
      };
      savePersisted(slotId, merged);
    },
    [slotId, notes, pinnedIds]
  );

  const onNotesChange = useCallback(
    (value: string) => {
      setNotes(value);
      if (notesDebounce.current) clearTimeout(notesDebounce.current);
      notesDebounce.current = setTimeout(() => {
        persist({ notes: value });
      }, 400);
    },
    [persist]
  );

  const togglePin = useCallback(
    (evidenceId: string) => {
      setPinnedIds((prev) => {
        const next = prev.includes(evidenceId) ? prev.filter((id) => id !== evidenceId) : [...prev, evidenceId];
        persist({ pinnedEvidenceIds: next });
        return next;
      });
    },
    [persist]
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!activeSlot || screen === "intro") return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (t?.closest('[role="textbox"]')) return;
      if (e.key === "n" || e.key === "N") {
        if (e.metaKey || e.ctrlKey || e.altKey) return;
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === "Escape" && open) {
        setOpen(false);
        setFocusEvidence(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activeSlot, screen, open]);

  const discoveredItems = useMemo(() => {
    if (!activeSlot) return [];
    const map = new Map(activeSlot.evidence.map((e) => [e.evidence_id, e]));
    return discoveredEvidence.map((id) => map.get(id)).filter((e): e is EvidenceDto => Boolean(e));
  }, [activeSlot, discoveredEvidence]);

  const searchLower = search.trim().toLowerCase();
  const filterText = (s: string) => !searchLower || s.toLowerCase().includes(searchLower);

  const filteredEvidence = useMemo(() => {
    let list = [...discoveredItems];
    if (searchLower) {
      list = list.filter(
        (e) =>
          filterText(e.name) ||
          filterText(e.description) ||
          filterText(e.location) ||
          filterText(evidenceLinkedSuspectLabel(activeSlot, e))
      );
    }
    list.sort((a, b) => {
      const ap = pinnedIds.includes(a.evidence_id) ? 0 : 1;
      const bp = pinnedIds.includes(b.evidence_id) ? 0 : 1;
      if (ap !== bp) return ap - bp;
      return a.name.localeCompare(b.name);
    });
    return list;
  }, [discoveredItems, searchLower, pinnedIds, activeSlot]);

  const filteredSuspects = useMemo(() => {
    if (!activeSlot) return [];
    let list = activeSlot.suspects;
    if (searchLower) {
      list = list.filter((s) => filterText(s.name) || filterText(s.occupation) || filterText(s.relationship_to_victim));
    }
    return list;
  }, [activeSlot, searchLower]);

  const notesMatchCount = useMemo(() => {
    if (!searchLower || !notes) return 0;
    let c = 0;
    let i = 0;
    while (true) {
      i = notes.toLowerCase().indexOf(searchLower, i);
      if (i === -1) break;
      c += 1;
      i += searchLower.length;
    }
    return c;
  }, [notes, searchLower]);

  if (!activeSlot || screen === "intro") {
    return null;
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-5 left-5 z-[140] flex h-12 w-12 items-center justify-center rounded-full border border-[#5c3d28]/80 bg-gradient-to-br from-[#3d2418] to-[#1f120c] text-h2 text-[#D4A843] shadow-[0_8px_28px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(255,220,180,0.12)] transition-transform hover:scale-105 hover:border-[#D4A843]/35"
        title="Detective notebook (N)"
        aria-label="Open detective notebook"
      >
        📓
      </button>

      <AnimatePresence>
        {open ? (
          <motion.div
            className="fixed inset-0 z-[200] flex items-stretch justify-start bg-black/55 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => {
              setOpen(false);
              setFocusEvidence(null);
            }}
          >
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-labelledby="notebook-title"
              className="notebook-leather flex h-full max-h-dvh w-[min(100%,520px)] flex-col border-r border-[#4a3020] shadow-[16px_0_48px_rgba(0,0,0,0.55)]"
              initial={{ x: "-108%", rotateY: -6 }}
              animate={{ x: 0, rotateY: 0 }}
              exit={{ x: "-108%", rotateY: -4 }}
              transition={{ type: "spring", damping: 28, stiffness: 260 }}
              style={{ perspective: 1400, transformStyle: "preserve-3d" }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex shrink-0 items-center justify-between border-b border-[#2a1810] bg-gradient-to-b from-[#3d2618] to-[#2a1810] px-4 py-3">
                <div>
                  <div id="notebook-title" className="text-h2 uppercase tracking-[3px] text-[#C9A961]">
                    Detective notebook
                  </div>
                  <div className="max-w-[280px] truncate text-label text-[#8B7355]">{activeSlot.title}</div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    setFocusEvidence(null);
                  }}
                  className="rounded border border-[#5c4030]/80 px-2 py-1 text-label uppercase tracking-wider text-[#A89880] hover:bg-[#1a120c]/60 hover:text-[#D4A843]"
                >
                  Close
                </button>
              </div>

              <div className="flex min-h-0 flex-1 flex-col gap-2 p-3 sm:flex-row">
                <nav className="flex shrink-0 flex-row gap-1 overflow-x-auto pb-1 sm:w-[108px] sm:flex-col sm:overflow-visible sm:pb-0">
                  {SECTIONS.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setSection(s.id)}
                      className={`whitespace-nowrap rounded border px-2 py-2 text-left text-label uppercase tracking-wider transition-colors sm:px-3 ${
                        section === s.id
                          ? "border-[#D4A843]/45 bg-[#2a1810]/95 text-[#D4A843]"
                          : "border-transparent text-[#8B7355] hover:border-[#5c4030]/60 hover:text-[#C9A961]"
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}
                </nav>

                <div className="notebook-paper flex min-h-0 min-w-0 flex-1 flex-col rounded-md border border-[#1a1510]/80 p-3 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.03)]">
                  <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center">
                    <input
                      type="search"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search clues, suspects, notes…"
                      className="w-full rounded border border-[#334455]/50 bg-[#0d121a]/90 px-2 py-1.5 text-body text-[#C8D0DC] outline-none placeholder:text-[#445566] focus:border-[#D4A843]/40"
                    />
                    {searchLower ? (
                      <span className="shrink-0 text-detail text-[#556677]">
                        {notesMatchCount > 0 ? `${notesMatchCount} in notes · ` : ""}filtered
                      </span>
                    ) : null}
                  </div>

                  <div className="min-h-0 flex-1 overflow-y-auto pr-1">
                    <AnimatePresence mode="wait">
                      <motion.section
                        key={section}
                        initial={{ opacity: 0, rotateY: -5, x: -10 }}
                        animate={{ opacity: 1, rotateY: 0, x: 0 }}
                        exit={{ opacity: 0, rotateY: 4, x: 8 }}
                        transition={{ duration: 0.32, ease: [0.22, 0.61, 0.36, 1] }}
                        className="pb-8"
                        style={{ transformStyle: "preserve-3d" }}
                      >
                        {section === "summary" ? (
                          <SummarySection slot={activeSlot} />
                        ) : null}
                        {section === "suspects" ? (
                          <SuspectsSection
                            slot={activeSlot}
                            suspects={filteredSuspects}
                            stress={suspectStress}
                            histories={interrogationHistories}
                            allEvidence={activeSlot.evidence}
                          />
                        ) : null}
                        {section === "evidence" ? (
                          <EvidenceSection
                            items={filteredEvidence}
                            activeSlot={activeSlot}
                            pinnedIds={pinnedIds}
                            togglePin={togglePin}
                            focusEvidence={focusEvidence}
                            setFocusEvidence={setFocusEvidence}
                            toggleEvidenceSelection={toggleEvidenceSelection}
                            selectedEvidenceIds={selectedEvidenceIds}
                            histories={interrogationHistories}
                            suspects={activeSlot.suspects}
                          />
                        ) : null}
                        {section === "notes" ? <NotesSection notes={notes} onChange={onNotesChange} search={searchLower} /> : null}
                        {section === "timeline" ? (
                          <TimelineSection slot={activeSlot} histories={interrogationHistories} />
                        ) : null}
                      </motion.section>
                    </AnimatePresence>
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  );
}

function SummarySection({ slot }: { slot: DailySlotDto }) {
  const v = slot.victim;
  const summaryParagraph = slot.summary?.trim();
  const backstory = slot.backstory?.trim();
  const crimeScene = slot.crime_scene_detail?.trim();
  const narrativeTimeline = slot.timeline_context?.trim();
  const stakes = slot.stakes?.trim();
  const timeline = slot.timeline ?? [];

  return (
    <div className="space-y-4 text-body text-[#B8C2CE]">
      <h2 className="border-b border-[#334455]/40 pb-1 text-h2 uppercase tracking-[3px] text-[#D4A843]">Case dossier</h2>

      {summaryParagraph ? (
        <p className="leading-relaxed" style={{ fontFamily: "Georgia, serif" }}>
          {summaryParagraph}
        </p>
      ) : null}

      {backstory ? (
        <div className="leading-relaxed" style={{ fontFamily: "Georgia, serif" }}>
          <span className="text-label uppercase tracking-wider text-[#6E7C92]">Backstory · </span>
          {backstory}
        </div>
      ) : null}

      {crimeScene ? (
        <p className="border-l-2 border-[#D4A843]/30 pl-3 italic leading-relaxed text-[#9AA8B8]" style={{ fontFamily: "Georgia, serif" }}>
          {crimeScene}
        </p>
      ) : null}

      {narrativeTimeline ? (
        <div className="leading-relaxed" style={{ fontFamily: "Georgia, serif" }}>
          <span className="text-label uppercase tracking-wider text-[#6E7C92]">The evening · </span>
          {narrativeTimeline}
        </div>
      ) : null}

      {timeline.length > 0 ? (
        <div>
          <h3 className="mb-2 text-caption uppercase tracking-[2px] text-[#8899AA]">Sequence of record</h3>
          <ul className="space-y-2 border border-[#334455]/25 bg-[#0a0e14]/40 p-3 text-detail leading-relaxed text-[#A8B4C4]">
            {timeline.map((ev, i) => (
              <li key={`${ev.time ?? i}-${i}`} className="flex flex-col gap-0.5 sm:flex-row sm:gap-3">
                {ev.time ? (
                  <span className="shrink-0 font-medium uppercase tracking-wider text-[#D4A843]/90">{ev.time}</span>
                ) : null}
                <span className="min-w-0" style={{ fontFamily: "Georgia, serif" }}>
                  {ev.event}
                  {ev.witnessed_by?.length ? (
                    <span className="mt-0.5 block text-detail italic text-[#5c6678]">
                      Witnessed: {ev.witnessed_by.join(", ")}
                    </span>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {stakes ? (
        <div className="leading-relaxed" style={{ fontFamily: "Georgia, serif" }}>
          <span className="text-label uppercase tracking-wider text-[#6E7C92]">Stakes & consequences · </span>
          {stakes}
        </div>
      ) : null}

      <div className="space-y-2 border-t border-[#334455]/30 pt-3 leading-relaxed" style={{ fontFamily: "Georgia, serif" }}>
        <p>
          <span className="text-label uppercase tracking-wider text-[#6E7C92]">Victim · </span>
          {v.name}, {v.age} — {v.occupation}. <span className="italic text-[#8899AA]">{v.cause_of_death}</span>
        </p>
        <p>
          <span className="text-label uppercase tracking-wider text-[#6E7C92]">Setting & mood · </span>
          {slot.setting}. {slot.mood ? `Atmosphere: ${slot.mood}.` : ""}
        </p>
      </div>
    </div>
  );
}

function SuspectsSection({
  slot,
  suspects,
  stress,
  histories,
  allEvidence,
}: {
  slot: DailySlotDto;
  suspects: SuspectDto[];
  stress: Record<string, number>;
  histories: Record<string, Message[]>;
  allEvidence: EvidenceDto[];
}) {
  return (
    <div className="space-y-3">
      <h2 className="border-b border-[#334455]/40 pb-1 text-h2 uppercase tracking-[3px] text-[#D4A843]">Suspects</h2>
      <ul className="space-y-3">
        {suspects.map((s) => {
          const st = stress[s.character_id] ?? 0;
          const msgs = histories[s.character_id] ?? [];
          const contra = allEvidence.filter(
            (e) => implicatesSuspect(e, s) && !e.is_red_herring && e.implicates.trim().toLowerCase() !== "none"
          ).length;
          const slippery = msgs.filter((m) => m.role === "assistant" && SLIPPERY.has((m.tone ?? "").toLowerCase())).length;

          return (
            <li
              key={s.character_id}
              className="rounded border border-[#334455]/35 bg-[#0a0e14]/50 p-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-h2 font-semibold text-[#E8ECF3]" style={{ fontFamily: "Georgia, serif" }}>
                    {s.name}
                  </div>
                  <div className="mt-0.5 text-label text-[#6E7C92]">{s.occupation}</div>
                </div>
                <div className="text-right text-label">
                  <div className="text-[#D4A843]">Stress {Math.round(st)}%</div>
                  {contra > 0 ? <div className="text-[#F87171]">⚠ {contra} damning clues</div> : null}
                  {slippery > 0 ? <div className="text-[#94a3b8]">{slippery} tense replies</div> : null}
                </div>
              </div>
              <p className="mt-2 text-body leading-relaxed text-[#8899AA]">{s.relationship_to_victim}</p>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function EvidenceSection({
  items,
  activeSlot,
  pinnedIds,
  togglePin,
  focusEvidence,
  setFocusEvidence,
  toggleEvidenceSelection,
  selectedEvidenceIds,
  histories,
  suspects,
}: {
  items: EvidenceDto[];
  activeSlot: DailySlotDto | null;
  pinnedIds: string[];
  togglePin: (id: string) => void;
  focusEvidence: EvidenceDto | null;
  setFocusEvidence: (e: EvidenceDto | null) => void;
  toggleEvidenceSelection: (id: string) => void;
  selectedEvidenceIds: string[];
  histories: Record<string, Message[]>;
  suspects: SuspectDto[];
}) {
  return (
    <div className="space-y-3">
      <h2 className="border-b border-[#334455]/40 pb-1 text-h2 uppercase tracking-[3px] text-[#D4A843]">Evidence log</h2>
      <p className="text-body text-[#556677]">Tap a clue to see statements that reference it. Flag stars to pin.</p>
      <ul className="space-y-4">
        {items.map((ev) => {
          const pinned = pinnedIds.includes(ev.evidence_id);
          const linked = suspects.filter((s) => implicatesSuspect(ev, s));
          const isFocus = focusEvidence?.evidence_id === ev.evidence_id;

          return (
            <li key={ev.evidence_id} className="rounded border border-[#334455]/40 bg-[#080c12]/60 p-2">
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setFocusEvidence(isFocus ? null : ev)}
                  className={`shrink-0 rounded outline-none ring-offset-2 ring-offset-[#121820] transition-shadow ${
                    isFocus ? "ring-2 ring-[#D4A843]/70" : "hover:ring-1 hover:ring-[#D4A843]/30"
                  }`}
                >
                  <EvidenceImage evidence={ev} size="compact" />
                </button>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <button type="button" onClick={() => setFocusEvidence(isFocus ? null : ev)} className="text-left">
                      <div className="text-h2 font-semibold text-[#E8ECF3]" style={{ fontFamily: "Georgia, serif" }}>
                        {ev.name}
                      </div>
                      <div className="text-label text-[#6E7C92]">{ev.location}</div>
                    </button>
                    <div className="flex flex-col items-end gap-1">
                      <button
                        type="button"
                        onClick={() => togglePin(ev.evidence_id)}
                        className={`text-subtitle leading-none ${pinned ? "text-[#D4A843]" : "text-[#445566] hover:text-[#8899AA]"}`}
                        title={pinned ? "Unpin" : "Pin clue"}
                      >
                        {pinned ? "★" : "☆"}
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleEvidenceSelection(ev.evidence_id)}
                        className="text-detail uppercase tracking-wider text-[#6BA3E8] hover:text-[#D4A843]"
                      >
                        {selectedEvidenceIds.includes(ev.evidence_id) ? "Selected" : "Select"}
                      </button>
                    </div>
                  </div>
                  <p className="mt-1 line-clamp-3 text-body leading-relaxed text-[#8899AA]" style={{ fontFamily: "Georgia, serif" }}>
                    {ev.description}
                  </p>
                  <div className="mt-1 text-detail text-[#D4A843]/90">
                    Linked: {activeSlot ? evidenceLinkedSuspectLabel(activeSlot, ev) : "—"}
                    {ev.is_red_herring ? " · unverified" : ""}
                    {linked.length > 0 ? ` · watch: ${linked.map((l) => l.name).join(", ")}` : ""}
                  </div>
                </div>
              </div>

              {isFocus ? (
                <div className="mt-3 border-t border-[#334455]/35 pt-3">
                  <div className="text-detail uppercase tracking-wider text-[#D4A843]">References in interrogation</div>
                  {suspects.map((sus) => {
                    const snippets = assistantSnippetsForEvidence(ev, histories[sus.character_id] ?? []);
                    if (snippets.length === 0) return null;
                    const risky = snippets.filter((x) => x.tone && SLIPPERY.has((x.tone ?? "").toLowerCase()));
                    return (
                      <div key={sus.character_id} className="mt-2 rounded border border-[#2a3544] bg-[#060910]/80 p-2">
                        <div className="text-label font-semibold text-[#C8D0DC]">{sus.name}</div>
                        {risky.length > 0 ? (
                          <div className="mb-1 text-detail text-[#F87171]">⚠ {risky.length} high-tension / slippery beats</div>
                        ) : null}
                        <ul className="mt-1 space-y-2">
                          {snippets.map((sn, i) => (
                            <li key={i} className="text-label leading-relaxed text-[#9ca8b8]">
                              <span className="text-[#556677]">[{sn.tone ?? "—"}] </span>
                              {sn.excerpt}
                            </li>
                          ))}
                        </ul>
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function NotesSection({
  notes,
  onChange,
  search,
}: {
  notes: string;
  onChange: (v: string) => void;
  search: string;
}) {
  return (
    <div className="flex h-full min-h-[280px] flex-col">
      <h2 className="mb-2 border-b border-[#334455]/40 pb-1 text-h2 uppercase tracking-[3px] text-[#D4A843]">Your notes</h2>
      <textarea
        value={notes}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Write theories, alibis, doubts…"
        className="notebook-handwriting min-h-[220px] w-full flex-1 resize-y rounded border border-[#3a3028]/60 bg-[#0c0e12]/85 px-3 py-2 text-subtitle leading-relaxed text-[#c9b89a] outline-none placeholder:text-[#6b5c4a]/55 focus:border-[#D4A843]/35"
        style={{
          backgroundImage: `repeating-linear-gradient(
            transparent,
            transparent 27px,
            rgba(44,36,24,0.11) 28px
          )`,
        }}
        spellCheck
      />
      {search && notes.toLowerCase().includes(search) ? (
        <p className="mt-2 text-detail text-[#6FCF8C]">Search term found in your notes.</p>
      ) : null}
    </div>
  );
}

function TimelineSection({ slot, histories }: { slot: DailySlotDto; histories: Record<string, Message[]> }) {
  return (
    <div className="space-y-3">
      <h2 className="border-b border-[#334455]/40 pb-1 text-h2 uppercase tracking-[3px] text-[#D4A843]">Questioning timeline</h2>
      <ul className="space-y-3">
        {slot.suspects.map((s) => {
          const msgs = histories[s.character_id] ?? [];
          const userTurns = msgs.filter((m) => m.role === "user");
          const last = userTurns.at(-1);
          const lastLabel = last?.timestamp
            ? new Date(last.timestamp).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
            : userTurns.length === 0
              ? "Not questioned"
              : "—";

          return (
            <li key={s.character_id} className="flex items-baseline justify-between gap-3 border-b border-[#2a3544]/50 py-2">
              <span className="text-body text-[#C8D0DC]" style={{ fontFamily: "Georgia, serif" }}>
                {s.name}
              </span>
              <span className="shrink-0 text-label text-[#6E7C92]">
                {userTurns.length} rounds · last {lastLabel}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
