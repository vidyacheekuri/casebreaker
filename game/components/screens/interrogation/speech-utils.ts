import type { Dispatch, RefObject, SetStateAction } from "react";
import type { SuspectDto } from "@/lib/backend-types";
import {
  approxVisemeTimelineFromText,
  buildCharacterTimestampsFromText,
  type CharacterTimestampRange,
  type VisemeTimeline,
} from "@/lib/character/character-pipeline";
import type { SpokenSubtitle } from "@/components/screens/interrogation/AvatarPanel";

export interface PlaySpeechInput {
  text: string;
  suspect: SuspectDto | null;
  audioEnabled: RefObject<boolean>;
  audioRef: RefObject<HTMLAudioElement | null>;
  setSpeaking: Dispatch<SetStateAction<boolean>>;
  setCharacterTimestamps: Dispatch<SetStateAction<CharacterTimestampRange[] | null>>;
  setVisemeTimeline: Dispatch<SetStateAction<VisemeTimeline | null>>;
  setSpokenSubtitle: Dispatch<SetStateAction<SpokenSubtitle | null>>;
  startSpeechClock: () => void;
  finalizeSpeechPlayback: () => void;
}

export async function playSpeechText({
  text,
  suspect,
  audioEnabled,
  audioRef,
  setSpeaking,
  setCharacterTimestamps,
  setVisemeTimeline,
  setSpokenSubtitle,
  startSpeechClock,
  finalizeSpeechPlayback,
}: PlaySpeechInput): Promise<void> {
  if (!audioEnabled.current || !text.trim()) return;

  audioRef.current?.pause();
  if ("speechSynthesis" in window) window.speechSynthesis.cancel();

  setSpeaking(true);
  const fallbackTimeline = approxVisemeTimelineFromText(text, "local-fallback");
  const fallbackTimestamps = buildCharacterTimestampsFromText(text, fallbackTimeline.durationMs);
  setCharacterTimestamps(fallbackTimestamps);
  setVisemeTimeline(fallbackTimeline);
  setSpokenSubtitle({
    speaker: suspect?.name ?? "Suspect",
    text,
    durationMs: Math.max(1600, Math.min(12000, fallbackTimeline.durationMs)),
  });

  const timeout = window.setTimeout(() => finalizeSpeechPlayback(), Math.max(9000, text.length * 80));

  try {
    const response = await fetch("/api/speak", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, voiceId: suspect?.voice_id ?? undefined }),
    });
    if (!response.ok) throw new Error("speak unavailable");

    const payload = (await response.json()) as {
      audio?: string;
      characterTimestamps?: CharacterTimestampRange[];
      visemeTimeline?: VisemeTimeline | null;
    };
    if (!payload.audio) throw new Error("missing audio");

    setCharacterTimestamps(payload.characterTimestamps?.length ? payload.characterTimestamps : fallbackTimestamps);
    setVisemeTimeline(payload.visemeTimeline ?? fallbackTimeline);
    startSpeechClock();

    const audio = new Audio(`data:audio/mpeg;base64,${payload.audio}`);
    audioRef.current = audio;
    audio.onended = () => {
      window.clearTimeout(timeout);
      finalizeSpeechPlayback();
    };
    audio.onerror = () => {
      window.clearTimeout(timeout);
      finalizeSpeechPlayback();
    };
    await audio.play();
  } catch {
    setCharacterTimestamps(fallbackTimestamps);
    setVisemeTimeline(fallbackTimeline);
    startSpeechClock();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.92;
    utterance.pitch = 0.9;
    utterance.onend = () => {
      window.clearTimeout(timeout);
      finalizeSpeechPlayback();
    };
    utterance.onerror = () => {
      window.clearTimeout(timeout);
      finalizeSpeechPlayback();
    };
    window.speechSynthesis.speak(utterance);
  }
}
