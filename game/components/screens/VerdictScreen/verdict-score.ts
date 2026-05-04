import type { AccuseResponse, DailySlotDto, EvidenceDto } from "@/lib/backend-types";

export type VerdictGrade = "S" | "A" | "B" | "C";

export interface VerdictScoreBreakdown {
  timeSeconds: number;
  timeScore: number;
  stressScore: number;
  averageStress: number;
  evidenceAccuracyPct: number;
  evidenceScore: number;
  total: number;
  grade: VerdictGrade;
}

function gradeFromTotal(total: number): VerdictGrade {
  if (total >= 85) return "S";
  if (total >= 70) return "A";
  if (total >= 55) return "B";
  return "C";
}

function implicatesKiller(evidence: EvidenceDto, killerId: string, killerName: string): boolean {
  const im = evidence.implicates.trim().toLowerCase();
  if (!im || im === "none") return false;
  const kid = killerId.toLowerCase();
  const kn = killerName.trim().toLowerCase();
  const first = kn.split(" ")[0] ?? "";
  return im === kid || im.includes(kid) || (first.length > 2 && im.includes(first));
}

/**
 * Weighted: time 40%, stress composure 35%, evidence accuracy against killer-linked clues 25%.
 */
export function computeVerdictScores(
  accusation: AccuseResponse,
  activeSlot: DailySlotDto,
  accusationEvidenceIds: string[],
  suspectStress: Record<string, number>,
  elapsedSeconds: number
): VerdictScoreBreakdown {
  const killer = activeSlot.suspects.find((s) => s.character_id === accusation.killer_id);
  const killerName = killer?.name ?? accusation.killer_name;

  const relevant = activeSlot.evidence.filter((e) => implicatesKiller(e, accusation.killer_id, killerName));
  const relevantIds = new Set(relevant.map((e) => e.evidence_id));
  const used = accusationEvidenceIds.filter(Boolean);
  const hits = used.filter((id) => relevantIds.has(id)).length;
  const evidenceAccuracyPct =
    relevant.length > 0 ? Math.round((hits / relevant.length) * 100) : accusation.correct ? 72 : 32;

  const stressValues = activeSlot.suspects.map((s) => suspectStress[s.character_id] ?? 0);
  const averageStress =
    stressValues.length > 0 ? stressValues.reduce((a, b) => a + b, 0) / stressValues.length : 0;

  const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

  const tSec = Math.max(1, Math.min(99999, accusation.solve_time_seconds ?? elapsedSeconds));

  const timePenalty = Math.min(58, Math.max(0, (tSec - 240) * 0.07 + (tSec > 900 ? 12 : 0)));
  const timeScore = clamp(100 - timePenalty, 0, 100);

  const stressScore = clamp(100 - averageStress * 0.92, 0, 100);

  const evidenceScore = clamp(evidenceAccuracyPct + (accusation.correct ? 12 : -18), 0, 100);

  const weighted = timeScore * 0.4 + stressScore * 0.35 + evidenceScore * 0.25;
  const total = Math.round(clamp(weighted, 0, 100));
  const grade = gradeFromTotal(total);

  return {
    timeSeconds: tSec,
    timeScore: Math.round(timeScore),
    stressScore: Math.round(stressScore),
    averageStress: Math.round(averageStress * 10) / 10,
    evidenceAccuracyPct,
    evidenceScore: Math.round(evidenceScore),
    total,
    grade,
  };
}

export function stampEvidenceSlide(ev: EvidenceDto, killerId: string, killerName: string): "check" | "cross" {
  if (implicatesKiller(ev, killerId, killerName)) return "check";
  if (ev.is_red_herring) return "cross";
  const im = ev.implicates.trim().toLowerCase();
  if (im && im !== "none" && !implicatesKiller(ev, killerId, killerName)) return "cross";
  return "check";
}
