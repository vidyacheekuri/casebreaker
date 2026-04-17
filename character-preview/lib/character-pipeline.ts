export type LipRigType = "morphTargets" | "jawBone" | "none";

export interface CharacterSpec {
  storyId: string;
  role: "suspect" | "witness" | "detective" | "custom";
  era: string;
  styleTags: string[];
  ageRange: [number, number];
  genderPresentation: "male" | "female" | "androgynous" | "unspecified";
}

export interface CharacterAsset {
  id: string;
  name: string;
  modelUrl: string;
  source: "curated" | "generated";
  tags: string[];
}

export interface RigReport {
  lipRig: LipRigType;
  hasHeadBone: boolean;
  hasMorphTargets: boolean;
  hasJawBone: boolean;
  morphTargetCount: number;
  issues: string[];
}

export interface VisemeEvent {
  timeMs: number;
  viseme: string;
  strength: number;
}

export interface VisemeTimeline {
  provider: string;
  durationMs: number;
  events: VisemeEvent[];
}

export interface CharacterTimestampRange {
  char: string;
  startMs: number;
  endMs: number;
}

export interface StoryCharacterSession {
  storyId: string;
  sessionId: string;
  spec: CharacterSpec;
  asset: CharacterAsset;
  rigReport: RigReport;
  createdAtIso: string;
}

export const DEFAULT_CHARACTER_SPEC: Omit<CharacterSpec, "storyId"> = {
  role: "suspect",
  era: "1920s",
  styleTags: ["human", "interrogation", "formal"],
  ageRange: [35, 55],
  genderPresentation: "male",
};

export function makeStorySpec(storyId: string): CharacterSpec {
  return {
    storyId,
    ...DEFAULT_CHARACTER_SPEC,
  };
}

export function approxVisemeTimelineFromText(
  text: string,
  provider: string,
  msPerChar = 55
): VisemeTimeline {
  const cleaned = text.trim();
  const durationMs = Math.max(1200, cleaned.length * msPerChar);
  const chunkSize = 3;
  const events: VisemeEvent[] = [];
  const visemeCycle = ["aa", "eh", "oh", "ih", "ou"];

  for (let i = 0; i < cleaned.length; i += chunkSize) {
    const ratio = cleaned.length === 0 ? 0 : i / cleaned.length;
    const timeMs = Math.round(ratio * durationMs);
    const char = cleaned[i]?.toLowerCase() ?? "a";
    let viseme = visemeCycle[i % visemeCycle.length];
    if ("aeiou".includes(char)) viseme = `${char}${char}`;
    const strength = 0.45 + ((i / chunkSize) % 3) * 0.15;
    events.push({
      timeMs,
      viseme,
      strength: Math.min(1, strength),
    });
  }

  return { provider, durationMs, events };
}
