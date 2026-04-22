import { create } from "zustand";
import {
  accuseSession,
  getDailySlots,
  getSessionState,
  matchDailySlot,
  startSession,
} from "@/lib/backend-client";
import type {
  AccuseResponse,
  DailyKeywordDto,
  DailySlotDto,
  EvidenceDto,
} from "@/lib/backend-types";

export type Screen =
  | "intro"
  | "cinematic"
  | "manor"
  | "room"
  | "evidence"
  | "interrogation"
  | "accusation"
  | "verdict";

export interface Message {
  role: "user" | "assistant";
  content: string;
  tone?: string;
}

export interface InvestigationRoom {
  room_id: string;
  name: string;
  description: string;
  evidence_ids: string[];
}

const MAX_KEYWORD_SELECTION = 4;

function toRoomId(location: string): string {
  return location
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "") || "unknown_room";
}

function toTitleCase(text: string): string {
  const normalized = text
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalized) {
    return "Unknown Location";
  }

  return normalized
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

export function buildRoomsFromEvidence(evidence: EvidenceDto[]): InvestigationRoom[] {
  const grouped = new Map<string, InvestigationRoom>();

  for (const clue of evidence) {
    const roomId = toRoomId(clue.location);
    if (!grouped.has(roomId)) {
      grouped.set(roomId, {
        room_id: roomId,
        name: toTitleCase(clue.location),
        description: `Search clues from ${toTitleCase(clue.location)}.`,
        evidence_ids: [],
      });
    }

    const room = grouped.get(roomId);
    if (room && !room.evidence_ids.includes(clue.evidence_id)) {
      room.evidence_ids.push(clue.evidence_id);
    }
  }

  return Array.from(grouped.values()).sort((a, b) => a.name.localeCompare(b.name));
}

function buildStressMap(slot: DailySlotDto | null): Record<string, number> {
  if (!slot) {
    return {};
  }

  const entries = slot.suspects.map((suspect) => [suspect.character_id, 0]);
  return Object.fromEntries(entries);
}

function buildHistoryMap(slot: DailySlotDto | null): Record<string, Message[]> {
  if (!slot) {
    return {};
  }

  const entries = slot.suspects.map((suspect) => [suspect.character_id, [] as Message[]]);
  return Object.fromEntries(entries);
}

function hydrateHistoryFromTranscript(
  slot: DailySlotDto,
  transcript: Array<{ character_id: string; speaker: string; text: string; tone: string | null }>
): Record<string, Message[]> {
  const seeded = buildHistoryMap(slot);
  for (const turn of transcript) {
    const role = turn.speaker.toLowerCase() === "detective" ? "user" : "assistant";
    const nextMessage: Message = {
      role,
      content: turn.text,
      tone: turn.tone ?? undefined,
    };
    seeded[turn.character_id] = [...(seeded[turn.character_id] ?? []), nextMessage];
  }
  return seeded;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return "Something went wrong. Please try again.";
}

interface GameState {
  screen: Screen;
  gameStartTime: number | null;

  loadingLanding: boolean;
  landingError: string | null;
  startingSession: boolean;
  startError: string | null;

  dailyKeywords: DailyKeywordDto[];
  selectedKeywordIds: string[];
  hiddenSlots: DailySlotDto[];

  matchedSlotId: string | null;
  sessionId: string | null;
  activeSlot: DailySlotDto | null;

  rooms: InvestigationRoom[];
  selectedRoomId: string | null;
  selectedSuspectId: string | null;

  searchedRooms: string[];
  discoveredEvidence: string[];
  selectedEvidenceIds: string[];
  reviewedEvidenceIds: string[];
  accusationEvidenceIds: string[];

  suspectStress: Record<string, number>;
  interrogationHistories: Record<string, Message[]>;

  latestInstinctQuote: string | null;
  accusation: AccuseResponse | null;

  goTo: (screen: Screen) => void;
  initializeLanding: () => Promise<void>;
  toggleKeywordSelection: (keywordId: string) => void;
  clearKeywordSelection: () => void;
  startSessionFromKeywords: () => Promise<boolean>;

  selectRoom: (roomId: string) => void;
  searchRoom: (roomId: string, evidenceIds: string[]) => void;
  selectSuspect: (characterId: string) => void;
  discoverEvidence: (evidenceId: string) => void;
  toggleEvidenceSelection: (evidenceId: string) => void;
  markEvidenceReviewed: (evidenceId: string) => void;
  setEvidenceForAccusation: (evidenceId: string, value: boolean) => void;
  increaseStress: (characterId: string, amount: number) => void;
  addMessages: (characterId: string, msgs: Message[]) => void;

  submitAccusation: (characterId: string, reasoning: string) => Promise<AccuseResponse>;
  resetGame: () => void;
}

export const useGameStore = create<GameState>((set, get) => ({
  screen: "intro",
  gameStartTime: null,

  loadingLanding: false,
  landingError: null,
  startingSession: false,
  startError: null,

  dailyKeywords: [],
  selectedKeywordIds: [],
  hiddenSlots: [],

  matchedSlotId: null,
  sessionId: null,
  activeSlot: null,

  rooms: [],
  selectedRoomId: null,
  selectedSuspectId: null,

  searchedRooms: [],
  discoveredEvidence: [],
  selectedEvidenceIds: [],
  reviewedEvidenceIds: [],
  accusationEvidenceIds: [],

  suspectStress: {},
  interrogationHistories: {},

  latestInstinctQuote: null,
  accusation: null,

  goTo: (screen) => {
    set((state) => ({
      screen,
      gameStartTime: screen === "cinematic" && !state.gameStartTime ? Date.now() : state.gameStartTime,
    }));
  },

  initializeLanding: async () => {
    set({ loadingLanding: true, landingError: null });

    try {
      const response = await getDailySlots();
      set((state) => ({
        loadingLanding: false,
        landingError: null,
        dailyKeywords: response.daily_keywords,
        hiddenSlots: response.slots,
        selectedKeywordIds: state.selectedKeywordIds.filter((keywordId) =>
          response.daily_keywords.some((keyword) => keyword.keyword_id === keywordId)
        ),
      }));
    } catch (error) {
      set({ loadingLanding: false, landingError: errorMessage(error) });
    }
  },

  toggleKeywordSelection: (keywordId) => {
    set((state) => {
      const selected = state.selectedKeywordIds;
      if (selected.includes(keywordId)) {
        return {
          selectedKeywordIds: selected.filter((id) => id !== keywordId),
          startError: null,
        };
      }

      if (selected.length >= MAX_KEYWORD_SELECTION) {
        return {
          startError: `Pick up to ${MAX_KEYWORD_SELECTION} keywords.`,
        };
      }

      return {
        selectedKeywordIds: [...selected, keywordId],
        startError: null,
      };
    });
  },

  clearKeywordSelection: () => set({ selectedKeywordIds: [], startError: null }),

  startSessionFromKeywords: async () => {
    const state = get();

    if (state.selectedKeywordIds.length === 0) {
      set({ startError: "Select at least one keyword to begin.", startingSession: false });
      return false;
    }

    set({ startingSession: true, startError: null, landingError: null });

    try {
      const match = await matchDailySlot({
        selected_keyword_ids: state.selectedKeywordIds,
      });
      const session = await startSession({ slot_id: match.matched_slot_id });
      const sessionSnapshot = await getSessionState(session.session_id);

      let slots = state.hiddenSlots;
      let keywords = state.dailyKeywords;
      let activeSlot = slots.find((slot) => slot.slot_id === match.matched_slot_id) ?? null;

      if (!activeSlot) {
        const refreshed = await getDailySlots();
        slots = refreshed.slots;
        keywords = refreshed.daily_keywords;
        activeSlot = slots.find((slot) => slot.slot_id === match.matched_slot_id) ?? null;
      }

      if (!activeSlot) {
        throw new Error("The matched story is no longer available. Please try again.");
      }

      set({
        screen: "cinematic",
        gameStartTime: Date.now(),
        startingSession: false,
        startError: null,

        hiddenSlots: slots,
        dailyKeywords: keywords,

        matchedSlotId: match.matched_slot_id,
        sessionId: session.session_id,
        activeSlot,

        rooms: buildRoomsFromEvidence(activeSlot.evidence),
        selectedRoomId: null,
        selectedSuspectId: null,

        searchedRooms: [],
        discoveredEvidence: sessionSnapshot.state.evidence_examined,
        selectedEvidenceIds: [],
        reviewedEvidenceIds: sessionSnapshot.state.evidence_examined,
        accusationEvidenceIds: [],

        suspectStress: buildStressMap(activeSlot),
        interrogationHistories: hydrateHistoryFromTranscript(activeSlot, sessionSnapshot.transcript),

        latestInstinctQuote: null,
        accusation: null,
      });

      return true;
    } catch (error) {
      set({
        startingSession: false,
        startError: errorMessage(error),
      });
      return false;
    }
  },

  selectRoom: (roomId) => set({ selectedRoomId: roomId }),

  searchRoom: (roomId, evidenceIds) => {
    set((state) => ({
      searchedRooms: state.searchedRooms.includes(roomId)
        ? state.searchedRooms
        : [...state.searchedRooms, roomId],
      discoveredEvidence: [
        ...state.discoveredEvidence,
        ...evidenceIds.filter((id) => !state.discoveredEvidence.includes(id)),
      ],
    }));
  },

  selectSuspect: (characterId) => set({ selectedSuspectId: characterId }),

  discoverEvidence: (evidenceId) => {
    set((state) => ({
      discoveredEvidence: state.discoveredEvidence.includes(evidenceId)
        ? state.discoveredEvidence
        : [...state.discoveredEvidence, evidenceId],
    }));
  },

  toggleEvidenceSelection: (evidenceId) => {
    set((state) => ({
      selectedEvidenceIds: state.selectedEvidenceIds.includes(evidenceId)
        ? state.selectedEvidenceIds.filter((id) => id !== evidenceId)
        : [...state.selectedEvidenceIds, evidenceId],
      reviewedEvidenceIds: state.reviewedEvidenceIds.includes(evidenceId)
        ? state.reviewedEvidenceIds
        : [...state.reviewedEvidenceIds, evidenceId],
    }));
  },

  markEvidenceReviewed: (evidenceId) => {
    set((state) => ({
      reviewedEvidenceIds: state.reviewedEvidenceIds.includes(evidenceId)
        ? state.reviewedEvidenceIds
        : [...state.reviewedEvidenceIds, evidenceId],
    }));
  },

  setEvidenceForAccusation: (evidenceId, value) => {
    set((state) => ({
      accusationEvidenceIds: value
        ? state.accusationEvidenceIds.includes(evidenceId)
          ? state.accusationEvidenceIds
          : [...state.accusationEvidenceIds, evidenceId]
        : state.accusationEvidenceIds.filter((id) => id !== evidenceId),
    }));
  },

  increaseStress: (characterId, amount) => {
    set((state) => ({
      suspectStress: {
        ...state.suspectStress,
        [characterId]: Math.min(100, (state.suspectStress[characterId] ?? 0) + amount),
      },
    }));
  },

  addMessages: (characterId, msgs) => {
    set((state) => ({
      interrogationHistories: {
        ...state.interrogationHistories,
        [characterId]: [...(state.interrogationHistories[characterId] ?? []), ...msgs],
      },
    }));
  },

  submitAccusation: async (characterId, reasoning) => {
    const { sessionId } = get();
    if (!sessionId) {
      throw new Error("No active session. Start a case first.");
    }

    const verdict = await accuseSession(sessionId, {
      character_id: characterId,
      reasoning,
    });

    set({
      accusation: verdict,
      screen: "verdict",
    });

    return verdict;
  },

  resetGame: () => {
    set((state) => ({
      screen: "intro",
      gameStartTime: null,

      loadingLanding: false,
      landingError: null,
      startingSession: false,
      startError: null,

      selectedKeywordIds: [],
      matchedSlotId: null,
      sessionId: null,
      activeSlot: null,

      rooms: [],
      selectedRoomId: null,
      selectedSuspectId: null,

      searchedRooms: [],
      discoveredEvidence: [],
      selectedEvidenceIds: [],
      reviewedEvidenceIds: [],
      accusationEvidenceIds: [],

      suspectStress: {},
      interrogationHistories: {},

      latestInstinctQuote: null,
      accusation: null,

      dailyKeywords: state.dailyKeywords,
      hiddenSlots: state.hiddenSlots,
    }));
  },
}));
