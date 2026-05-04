import type { DailySlotDto, EvidenceDto, SuspectDto } from "@/lib/backend-types";

const TONE_STRESS_IMPACT: Record<string, number> = {
  guarded: 4,
  evasive: 7,
  defensive: 10,
  nervous: 12,
  hostile: 14,
  anxious: 9,
  composed: 2,
  calm: 1,
};

export function stressImpactFromTone(tone: string): number {
  const normalized = tone.trim().toLowerCase();
  return TONE_STRESS_IMPACT[normalized] ?? 5;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export async function revealByWords(text: string, onChunk: (value: string) => void): Promise<void> {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    onChunk("");
    return;
  }

  let assembled = "";
  for (let index = 0; index < words.length; index += 1) {
    assembled = assembled ? `${assembled} ${words[index]}` : words[index];
    onChunk(assembled);
    await wait(26);
  }
}

function normalizeQuestion(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function wasAsked(question: string, messages: Array<{ role: string; content: string }>): boolean {
  const normalizedQuestion = normalizeQuestion(question);
  return messages.some(
    (message) =>
      message.role === "user" &&
      (normalizeQuestion(message.content).includes(normalizedQuestion) ||
        normalizedQuestion.includes(normalizeQuestion(message.content)))
  );
}

function extractFollowUpPhrase(text: string): string | null {
  const quoted = text.match(/"([^"]{8,80})"/);
  if (quoted?.[1]) {
    return quoted[1];
  }

  const sentences = text
    .split(/[.!?]/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length >= 18 && sentence.length <= 110);

  return sentences[0] ?? null;
}

export function buildSuggestedQuestions(
  suspect: SuspectDto,
  messages: Array<{ role: string; content: string; tone?: string }>,
  selectedEvidence: EvidenceDto[],
  contradictoryEvidence: EvidenceDto[],
  allSuspects: SuspectDto[] = [],
  activeSlot?: DailySlotDto | null,
  stress = 0
): string[] {
  const lastSuspectMessage = [...messages].reverse().find((message) => message.role === "assistant");
  const lastDetectiveMessage = [...messages].reverse().find((message) => message.role === "user");
  const followUpPhrase = lastSuspectMessage ? extractFollowUpPhrase(lastSuspectMessage.content) : null;
  const latestTone = lastSuspectMessage?.tone?.toLowerCase() ?? "";
  const otherSuspects = allSuspects.filter((candidate) => candidate.character_id !== suspect.character_id);
  const relevantTimeline = activeSlot?.timeline?.find((event) =>
    [event.event, event.time, ...(event.witnessed_by ?? [])]
      .join(" ")
      .toLowerCase()
      .includes(suspect.character_id.toLowerCase())
  );
  const trait = suspect.archetype || suspect.occupation;
  const wound = suspect.private_wound || suspect.secret;
  const pressureTarget = suspect.motive || suspect.secret || suspect.relationship_to_victim;
  const candidates: string[] = [];

  if (followUpPhrase) {
    candidates.push(`When you said "${followUpPhrase}", what were you trying to leave unsaid?`);
  }

  if (contradictoryEvidence[0]) {
    candidates.push(`${contradictoryEvidence[0].name} points back to you. What part of your story does it not fit?`);
  }

  if (contradictoryEvidence[1]) {
    candidates.push(`Two clues now touch your account: ${contradictoryEvidence[0].name} and ${contradictoryEvidence[1].name}. Which one worries you more?`);
  }

  if (selectedEvidence[0] && !contradictoryEvidence[0]) {
    candidates.push(`You have not mentioned ${selectedEvidence[0].name}. Why would that detail matter tonight?`);
  }

  if (relevantTimeline?.time || relevantTimeline?.event) {
    candidates.push(`At ${relevantTimeline.time ?? "that point"}, ${relevantTimeline.event ?? "your name enters the timeline"}. What are we missing there?`);
  }

  if (["evasive", "guarded", "defensive", "nervous", "hostile", "anxious"].includes(latestTone)) {
    candidates.push(`That sounded ${latestTone}. Which part of my question made you careful?`);
  }

  if (lastDetectiveMessage?.content.toLowerCase().includes("alibi")) {
    candidates.push("Who can confirm that version of your alibi?");
    candidates.push(`Your alibi is "${trimForQuestion(suspect.alibi, 70)}". What detail from that moment would prove it?`);
  }

  if (stress >= 65) {
    candidates.push(`${trimForQuestion(wound, 80)} keeps coming up around you. Why should I believe it did not shape your choices?`);
  } else if (stress >= 35) {
    candidates.push(`You are getting careful now. Is this about ${trimForQuestion(pressureTarget, 80)}?`);
  } else {
    candidates.push(`As a ${trait}, you know how people read a room. Who looked most afraid after the death?`);
  }

  if (otherSuspects[0]) {
    candidates.push(`${otherSuspects[0].name} gives a very different account of the night. What would they gain by shading the truth?`);
  }

  if (otherSuspects[1]) {
    candidates.push(`${otherSuspects[1].name} had their own reason to watch the victim. Did you see them near ${activeSlot?.setting ?? "the scene"}?`);
  }

  candidates.push(
    `Your relationship to the victim was "${trimForQuestion(suspect.relationship_to_victim, 70)}". Where did that relationship turn sour?`,
    `What would the victim have said about you if they were still alive?`,
    `Who benefits if I stop looking at you and start looking elsewhere?`,
    `What are you leaving out because it sounds worse than it is?`
  );

  return candidates
    .filter((question, index, all) => all.indexOf(question) === index)
    .filter((question) => !wasAsked(question, messages))
    .slice(0, 4);
}

function trimForQuestion(value: string | undefined, maxLength: number): string {
  const cleaned = (value ?? "").replace(/\s+/g, " ").trim();
  if (!cleaned) {
    return "that";
  }
  return cleaned.length > maxLength ? `${cleaned.slice(0, maxLength).trim()}...` : cleaned;
}

export function buildEvidenceContext(selectedEvidence: EvidenceDto[], contradictoryEvidence: EvidenceDto[]): string {
  if (contradictoryEvidence.length > 0) {
    return `\n\n[Detective note: The player has selected evidence that points at this suspect: ${contradictoryEvidence
      .map((item) => item.name)
      .join(", ")}. Let the pressure show in the reply through hesitation, defensiveness, or over-explanation.]`;
  }

  if (selectedEvidence.length > 0) {
    return `\n\n[Detective note: The player has selected evidence: ${selectedEvidence
      .map((item) => item.name)
      .join(", ")}. Acknowledge relevant details naturally if asked.]`;
  }

  return "";
}

export function revealSubtitleText(
  subtitle: { text: string; durationMs: number } | null,
  elapsedMs: number,
  speaking: boolean
): string {
  if (!subtitle) return "";
  const rawProgress = subtitle.durationMs > 0 ? Math.min(1, elapsedMs / subtitle.durationMs) : 1;
  const easedProgress = 1 - Math.pow(1 - rawProgress, 1.8);
  const visibleChars = Math.min(
    subtitle.text.length,
    Math.max(speaking ? 1 : 0, Math.ceil(subtitle.text.length * easedProgress))
  );
  return subtitle.text.slice(0, visibleChars);
}
