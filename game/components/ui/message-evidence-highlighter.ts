import type { EvidenceDto } from "@/lib/backend-types";

export type EvidenceSegment =
  | { type: "text"; value: string }
  | { type: "evidence"; value: string; evidence: EvidenceDto; contradicts: boolean };

/**
 * Split message text around evidence names (longest-first) for gold highlights and tooltips.
 */
export function segmentMessageWithEvidence(
  text: string,
  evidenceList: EvidenceDto[],
  contradicts: (evidence: EvidenceDto) => boolean
): EvidenceSegment[] {
  const sorted = [...evidenceList].sort((a, b) => b.name.trim().length - a.name.trim().length);
  const out: EvidenceSegment[] = [];
  let i = 0;
  const hay = text;

  while (i < hay.length) {
    let match: { start: number; end: number; ev: EvidenceDto } | null = null;

    for (const ev of sorted) {
      const name = ev.name.trim();
      if (name.length < 3) continue;
      const idx = hay.toLowerCase().indexOf(name.toLowerCase(), i);
      if (idx === -1) continue;
      if (!match || idx < match.start) {
        match = { start: idx, end: idx + name.length, ev };
      }
    }

    if (!match) {
      out.push({ type: "text", value: hay.slice(i) });
      break;
    }

    if (match.start > i) {
      out.push({ type: "text", value: hay.slice(i, match.start) });
    }

    const raw = hay.slice(match.start, match.end);
    out.push({
      type: "evidence",
      value: raw,
      evidence: match.ev,
      contradicts: contradicts(match.ev),
    });
    i = match.end;
  }

  return out.length ? out : [{ type: "text", value: text }];
}

export function messageTurnIndex(messages: Array<{ role: string }>, index: number): number {
  if (index < 0 || index >= messages.length) return 1;
  if (messages[index].role === "user") {
    return messages.slice(0, index + 1).filter((m) => m.role === "user").length;
  }
  return Math.max(1, messages.slice(0, index).filter((m) => m.role === "user").length);
}
