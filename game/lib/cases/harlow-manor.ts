export type SuspectId = "fenn" | "victoria" | "oliver";
export type EvidenceId = "ev_brandy" | "ev_bag" | "ev_will" | "ev_gloves" | "ev_diary" | "ev_debt";
export type RoomId = "library" | "study" | "guest_room" | "master_bedroom" | "greenhouse" | "olivers_room";

export interface Suspect {
  id: SuspectId;
  name: string;
  age: number;
  occupation: string;
  relationship: string;
  personality: string;
  isKiller: boolean;
  voiceId: string;
  portrait: string;
}

export interface Evidence {
  id: EvidenceId;
  name: string;
  room: RoomId;
  description: string;
  implicates: SuspectId | null;
  isRedHerring: boolean;
}

export interface Room {
  id: RoomId;
  name: string;
  description: string;
  evidence: EvidenceId[];
}

export interface Case {
  id: string;
  title: string;
  setting: string;
  date: string;
  victim: { name: string; age: number; occupation: string; causeOfDeath: string };
  killerId: SuspectId;
  motive: string;
  suspects: Suspect[];
  evidence: Evidence[];
  rooms: Room[];
  timeline: { time: string; event: string }[];
  verdict: { explanation: string; trueSequence: string; missedClues: string[] };
}

export const HARLOW_MANOR: Case = {
  id: "harlow-manor",
  title: "The Harlow Manor Affair",
  setting: "Harlow Manor, Devon, England",
  date: "October 14th, 1923",
  victim: {
    name: "Edmund Harlow",
    age: 62,
    occupation: "Industrialist",
    causeOfDeath: "Strychnine poisoning",
  },
  killerId: "victoria",
  motive:
    "Victoria discovered Edmund had secretly amended his will to leave his entire estate to charitable trusts, cutting her out entirely. Faced with destitution, she acted.",
  suspects: [
    {
      id: "fenn",
      name: "Dr. James Fenn",
      age: 48,
      occupation: "Physician",
      relationship: "Family doctor for 20 years",
      personality: "Measured, clinical, and precise. Deflects with medical jargon when nervous.",
      isKiller: false,
      voiceId: "pNInz6obpgDQGcFmaJgB",
      portrait: "JF",
    },
    {
      id: "victoria",
      name: "Victoria Harlow",
      age: 42,
      occupation: "Wife of the deceased",
      relationship: "Edmund's wife of 18 years",
      personality: "Ice-cold composure. Cultured, Edwardian elegance. Deflects to Oliver when pressed.",
      isKiller: true,
      voiceId: "ThT5KcBeYPX3keUQqHPh",
      portrait: "VH",
    },
    {
      id: "oliver",
      name: "Oliver Harlow",
      age: 28,
      occupation: "Edmund's nephew",
      relationship: "Edmund's nephew, sole blood heir",
      personality: "Anxious, talks too fast, volunteers too much detail — the innocent man's curse.",
      isKiller: false,
      voiceId: "TxGEqnHWrfWFTfGW9XjX",
      portrait: "OH",
    },
  ],
  evidence: [
    {
      id: "ev_brandy",
      name: "Brandy Glass",
      room: "library",
      description:
        "A crystal brandy glass found on Edmund's writing desk. Laboratory analysis confirms trace residue of strychnine along the interior rim. The glass has been wiped — no usable fingerprints remain.",
      implicates: "victoria",
      isRedHerring: false,
    },
    {
      id: "ev_bag",
      name: "Dr. Fenn's Medical Bag",
      room: "guest_room",
      description:
        "Dr. Fenn's black leather physician's bag, left in his guest room. The tray normally holding a strychnine solution (used as a cardiac stimulant) has an empty slot. The vial is missing. Dr. Fenn insists it was there when he arrived.",
      implicates: "fenn",
      isRedHerring: false,
    },
    {
      id: "ev_will",
      name: "Amended Will",
      room: "study",
      description:
        "A legal document dated October 7th — one week prior — bearing Edmund Harlow's signature and the seal of his solicitor. The entire estate, valued at £140,000, is left to three charitable trusts. Victoria Harlow receives nothing. The original will is crossed out.",
      implicates: "victoria",
      isRedHerring: false,
    },
    {
      id: "ev_gloves",
      name: "Muddy Gardening Gloves",
      room: "greenhouse",
      description:
        "A pair of women's gardening gloves, small size, found hidden behind clay pots in the greenhouse. Still damp. Victoria's monogram — V.H. — is embroidered on the cuff. The mud matches the greenhouse soil, but the gloves were found at 11 PM, well after dark.",
      implicates: "victoria",
      isRedHerring: false,
    },
    {
      id: "ev_diary",
      name: "Victoria's Diary",
      room: "master_bedroom",
      description:
        'A leather-bound diary found in Victoria\'s bedside drawer. The final entry, dated October 12th: "He intends to throw me away like refuse. Two decades of my life, and I am to be left with nothing while strangers inherit everything I built. I will not allow it. I have decided."',
      implicates: "victoria",
      isRedHerring: false,
    },
    {
      id: "ev_debt",
      name: "Debt Collection Letter",
      room: "olivers_room",
      description:
        "A threatening letter from Claridge & Sons, moneylenders, demanding immediate repayment of £4,200 in gambling debts. Addressed to Oliver Harlow. The letter references a previous meeting at which Edmund Harlow refused to settle the debt on Oliver's behalf.",
      implicates: "oliver",
      isRedHerring: true,
    },
  ],
  rooms: [
    {
      id: "library",
      name: "The Library",
      description: "Edmund's private library and study. His body was found here, slumped in the wingback chair by the fire. The brandy decanter sits on the sideboard.",
      evidence: ["ev_brandy"],
    },
    {
      id: "study",
      name: "The Study",
      description: "A formal writing room adjacent to the library. Filing cabinets line the walls. Edmund kept his private documents here.",
      evidence: ["ev_will"],
    },
    {
      id: "guest_room",
      name: "The Guest Room",
      description: "Dr. Fenn's assigned room for the weekend visit. Sparse and orderly — as its occupant prefers.",
      evidence: ["ev_bag"],
    },
    {
      id: "master_bedroom",
      name: "Master Bedroom",
      description: "Edmund and Victoria's bedroom. Victoria has already moved her personal effects to the adjacent dressing room.",
      evidence: ["ev_diary"],
    },
    {
      id: "greenhouse",
      name: "The Greenhouse",
      description: "A Victorian wrought-iron greenhouse attached to the east wing. Victoria's personal domain — she tends exotic orchids here.",
      evidence: ["ev_gloves"],
    },
    {
      id: "olivers_room",
      name: "Oliver's Room",
      description: "Oliver's assigned guest room. Clothes scattered, empty whiskey glass on the nightstand.",
      evidence: ["ev_debt"],
    },
  ],
  timeline: [
    { time: "8:00 PM", event: "All four gather for dinner in the dining room." },
    { time: "9:00 PM", event: "Edmund retires to the library with a brandy." },
    { time: "9:10 PM", event: "Victoria is seen in the guest wing corridor near Dr. Fenn's room by the cook." },
    { time: "9:30 PM", event: "Oliver visits the library. He and Edmund argue violently about the inheritance." },
    { time: "9:45 PM", event: "Oliver leaves the library, slamming the door. Heard by the housekeeper." },
    { time: "10:00 PM", event: "Victoria brings Edmund a 'second glass of brandy' — her stated reason for entering the library." },
    { time: "10:15 PM", event: "Edmund is found collapsed in his chair. Dr. Fenn is summoned." },
    { time: "10:25 PM", event: "Dr. Fenn pronounces Edmund dead. Notes the rigid muscle contractions consistent with strychnine." },
  ],
  verdict: {
    explanation:
      "Victoria Harlow murdered her husband Edmund by lacing his brandy with strychnine stolen from Dr. Fenn's medical bag. She discovered the amended will on October 12th — the date of her final diary entry. That evening at 9:10 PM, while Oliver and Edmund argued in the library, she entered the guest wing and took the strychnine vial. She then delivered the poisoned glass to Edmund at 10:00 PM, after the argument with Oliver had conveniently created an alternative suspect.",
    trueSequence:
      "Victoria finds amended will → resolves to act → steals strychnine from Fenn's bag during dinner → poisons Edmund's brandy → delivers it under guise of bringing a second glass → disposes of gloves in greenhouse → waits for the poison to work",
    missedClues: [
      "The amended will explains Victoria's motive — without it, she had no reason to act",
      "Victoria's alibi (garden) is impossible — it was raining from 8 PM onwards",
      "The muddy gloves were hidden, not dirty from afternoon gardening",
      "Oliver's alibi is actually verifiable — the housekeeper heard him leave and go upstairs",
      "Dr. Fenn saw Victoria near his room but has been protecting her",
    ],
  },
};

export const getSuspect = (id: SuspectId) =>
  HARLOW_MANOR.suspects.find((s) => s.id === id)!;

export const getEvidence = (id: EvidenceId) =>
  HARLOW_MANOR.evidence.find((e) => e.id === id)!;

export const getRoom = (id: RoomId) =>
  HARLOW_MANOR.rooms.find((r) => r.id === id)!;
