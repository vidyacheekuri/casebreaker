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

    if ("aeiou".includes(char)) {
      viseme = `${char}${char}`;
    }

    const strength = 0.45 + ((i / chunkSize) % 3) * 0.15;
    events.push({
      timeMs,
      viseme,
      strength: Math.min(1, strength),
    });
  }

  return { provider, durationMs, events };
}

export function buildCharacterTimestampsFromText(
  text: string,
  durationMs: number
): CharacterTimestampRange[] {
  const chars = Array.from(text);
  if (!chars.length) return [];

  const perChar = Math.max(20, durationMs / chars.length);
  return chars.map((char, index) => ({
    char,
    startMs: Math.round(index * perChar),
    endMs: Math.round((index + 1) * perChar),
  }));
}
