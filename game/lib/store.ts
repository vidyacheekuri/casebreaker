import { create } from "zustand";
import type { SuspectId, EvidenceId, RoomId } from "./cases/harlow-manor";

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
}

export interface VerdictResult {
  correct: boolean;
  accusedId: SuspectId;
  reasoning: string;
}

interface GameState {
  screen: Screen;
  selectedRoom: RoomId | null;
  selectedSuspect: SuspectId | null;
  discoveredEvidence: EvidenceId[];
  searchedRooms: RoomId[];
  suspectStress: Record<SuspectId, number>;
  interrogationHistories: Record<SuspectId, Message[]>;
  accusation: VerdictResult | null;
  gameStartTime: number | null;

  goTo: (screen: Screen) => void;
  selectRoom: (roomId: RoomId) => void;
  searchRoom: (roomId: RoomId, evidenceIds: EvidenceId[]) => void;
  selectSuspect: (suspectId: SuspectId) => void;
  discoverEvidence: (evidenceId: EvidenceId) => void;
  increaseStress: (suspectId: SuspectId, amount: number) => void;
  addMessages: (suspectId: SuspectId, msgs: Message[]) => void;
  submitAccusation: (suspectId: SuspectId, reasoning: string) => void;
  resetGame: () => void;
}

const defaultStress: Record<SuspectId, number> = {
  fenn: 0,
  victoria: 0,
  oliver: 0,
};

const defaultHistories: Record<SuspectId, Message[]> = {
  fenn: [],
  victoria: [],
  oliver: [],
};

export const useGameStore = create<GameState>((set, get) => ({
  screen: "intro",
  selectedRoom: null,
  selectedSuspect: null,
  discoveredEvidence: [],
  searchedRooms: [],
  suspectStress: { ...defaultStress },
  interrogationHistories: {
    fenn: [],
    victoria: [],
    oliver: [],
  },
  accusation: null,
  gameStartTime: null,

  goTo: (screen) => {
    set((s) => ({
      screen,
      gameStartTime: screen === "cinematic" && !s.gameStartTime ? Date.now() : s.gameStartTime,
    }));
  },

  selectRoom: (roomId) => set({ selectedRoom: roomId }),

  searchRoom: (roomId, evidenceIds) => {
    set((s) => ({
      searchedRooms: s.searchedRooms.includes(roomId)
        ? s.searchedRooms
        : [...s.searchedRooms, roomId],
      discoveredEvidence: [
        ...s.discoveredEvidence,
        ...evidenceIds.filter((id) => !s.discoveredEvidence.includes(id)),
      ],
    }));
  },

  selectSuspect: (suspectId) => set({ selectedSuspect: suspectId }),

  discoverEvidence: (evidenceId) => {
    set((s) => ({
      discoveredEvidence: s.discoveredEvidence.includes(evidenceId)
        ? s.discoveredEvidence
        : [...s.discoveredEvidence, evidenceId],
    }));
  },

  increaseStress: (suspectId, amount) => {
    set((s) => ({
      suspectStress: {
        ...s.suspectStress,
        [suspectId]: Math.min(100, (s.suspectStress[suspectId] ?? 0) + amount),
      },
    }));
  },

  addMessages: (suspectId, msgs) => {
    set((s) => ({
      interrogationHistories: {
        ...s.interrogationHistories,
        [suspectId]: [...(s.interrogationHistories[suspectId] ?? []), ...msgs],
      },
    }));
  },

  submitAccusation: (suspectId, reasoning) => {
    set({ accusation: { correct: suspectId === "victoria", accusedId: suspectId, reasoning } });
  },

  resetGame: () =>
    set({
      screen: "intro",
      selectedRoom: null,
      selectedSuspect: null,
      discoveredEvidence: [],
      searchedRooms: [],
      suspectStress: { ...defaultStress },
      interrogationHistories: { fenn: [], victoria: [], oliver: [] },
      accusation: null,
      gameStartTime: null,
    }),
}));
