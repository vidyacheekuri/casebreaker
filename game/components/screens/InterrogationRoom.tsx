"use client";
import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { motion } from "framer-motion";
import { interrogateSession } from "@/lib/backend-client";
import { useGameStore } from "@/lib/store";
import type { DetectiveInstinctDto, EvidenceDto } from "@/lib/backend-types";
import EvidenceBoard from "@/components/ui/EvidenceBoard";
import AvatarPanel, { type SpokenSubtitle } from "@/components/screens/interrogation/AvatarPanel";
import ConversationPanel from "@/components/screens/interrogation/ConversationPanel";
import ControlPanel from "@/components/screens/interrogation/ControlPanel";
import StressGauge from "@/components/screens/interrogation/StressGauge";
import SuggestedQuestions from "@/components/screens/interrogation/SuggestedQuestions";
import CaseTimeline from "@/components/ui/CaseTimeline";
import InterrogationBackdrop from "@/components/ui/atmosphere/InterrogationBackdrop";
import { buildEvidenceContext, buildSuggestedQuestions, revealByWords, revealSubtitleText, stressImpactFromTone } from "@/components/screens/interrogation/interrogation-utils";
import { type CharacterTimestampRange, type VisemeTimeline } from "@/lib/character/character-pipeline";
import { playSpeechText } from "@/components/screens/interrogation/speech-utils";
export default function InterrogationRoom() {
  const {
    sessionId,
    activeSlot,
    selectedSuspectId,
    goTo,
    suspectStress,
    interrogationHistories,
    addMessages,
    increaseStress,
    selectedEvidenceIds,
    discoveredEvidence,
  } = useGameStore();
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [displayText, setDisplayText] = useState("");
  const [speaking, setSpeaking] = useState(false);
  const [instinct, setInstinct] = useState<DetectiveInstinctDto | null>(null);
  const [characterTimestamps, setCharacterTimestamps] = useState<CharacterTimestampRange[] | null>(null);
  const [visemeTimeline, setVisemeTimeline] = useState<VisemeTimeline | null>(null);
  const [speechElapsedMs, setSpeechElapsedMs] = useState(0);
  const [spokenSubtitle, setSpokenSubtitle] = useState<SpokenSubtitle | null>(null);
  const [streamKey, setStreamKey] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const audioEnabled = useRef(true);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const speechFrameRef = useRef<number | null>(null);
  const speechStartRef = useRef<number | null>(null);
  const suspect =
    activeSlot && selectedSuspectId
      ? activeSlot.suspects.find((candidate) => candidate.character_id === selectedSuspectId) ?? null
      : null;
  const messages = useMemo(
    () => (selectedSuspectId ? interrogationHistories[selectedSuspectId] ?? [] : []),
    [interrogationHistories, selectedSuspectId]
  );
  const stress = selectedSuspectId ? suspectStress[selectedSuspectId] ?? 0 : 0;
  const stressed = stress >= 40;
  const subjectStatus = stress >= 70 ? "Defensive" : stress >= 40 ? "Evasive" : "Cooperative";
  const selectedEvidence = useMemo(() => {
    if (!activeSlot) return [];
    return activeSlot.evidence.filter((item) => selectedEvidenceIds.includes(item.evidence_id));
  }, [activeSlot, selectedEvidenceIds]);
  const contradictoryEvidence = useMemo(() => {
    if (!suspect) return [];
    const suspectTokens = [suspect.character_id, suspect.name]
      .map((value) => value.toLowerCase())
      .filter(Boolean);
    return selectedEvidence.filter((item) =>
      suspectTokens.some((token) => item.implicates.toLowerCase().includes(token))
    );
  }, [selectedEvidence, suspect]);

  const contradictsEvidence = useCallback(
    (item: EvidenceDto) => {
      if (!suspect) return false;
      const t = suspect.character_id.toLowerCase();
      const n = suspect.name.toLowerCase();
      const im = item.implicates.trim().toLowerCase();
      return im !== "none" && im.length > 0 && (im.includes(t) || im.includes(n));
    },
    [suspect]
  );
  useEffect(() => {
    if (!sessionId || !activeSlot) {
      goTo("intro");
      return;
    }
    if (!selectedSuspectId || !suspect) {
      goTo("manor");
    }
  }, [activeSlot, goTo, selectedSuspectId, sessionId, suspect]);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, displayText, instinct]);
  const stopSpeechClock = useCallback(() => {
    if (speechFrameRef.current != null) {
      window.cancelAnimationFrame(speechFrameRef.current);
      speechFrameRef.current = null;
    }
    speechStartRef.current = null;
    setSpeechElapsedMs(0);
  }, []);
  const startSpeechClock = useCallback(() => {
    stopSpeechClock();
    const startedAt = performance.now();
    speechStartRef.current = startedAt;
    const tick = () => {
      if (speechStartRef.current == null) return;
      setSpeechElapsedMs(Math.max(0, performance.now() - speechStartRef.current));
      speechFrameRef.current = window.requestAnimationFrame(tick);
    };
    speechFrameRef.current = window.requestAnimationFrame(tick);
  }, [stopSpeechClock]);
  const finalizeSpeechPlayback = useCallback(() => {
    stopSpeechClock();
    audioRef.current = null;
    setSpeaking(false);
    setSpokenSubtitle(null);
  }, [stopSpeechClock]);
  useEffect(() => {
    return () => {
      audioRef.current?.pause();
      finalizeSpeechPlayback();
      if ("speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, [finalizeSpeechPlayback]);
  const speakText = useCallback(
    async (text: string) => {
      await playSpeechText({
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
      });
    },
    [finalizeSpeechPlayback, startSpeechClock, suspect]
  );
  const sendMessage = useCallback(async () => {
    if (!sessionId || !selectedSuspectId || !suspect) {
      return;
    }
    const text = input.trim();
    if (!text || loading) {
      return;
    }
    addMessages(selectedSuspectId, [{ role: "user", content: text }]);
    setInput("");
    setLoading(true);
    setDisplayText("");
    setInstinct(null);
    try {
      const response = await interrogateSession(sessionId, {
        character_id: selectedSuspectId,
        message: `${text}${buildEvidenceContext(selectedEvidence, contradictoryEvidence)}`,
      });
      const stressDelta = stressImpactFromTone(response.tone);
      increaseStress(selectedSuspectId, stressDelta);
      setStreamKey((k) => k + 1);
      await revealByWords(response.reply, setDisplayText);
      addMessages(selectedSuspectId, [
        {
          role: "assistant",
          content: response.reply,
          tone: response.tone,
          stressDelta,
        },
      ]);
      setDisplayText("");
      setInstinct(response.detective_instinct);
      void speakText(response.reply);
    } catch {
      setDisplayText("");
      finalizeSpeechPlayback();
      addMessages(selectedSuspectId, [
        {
          role: "assistant",
          content: `${suspect.name} goes quiet for a moment. Ask again in plain terms.`,
          tone: "guarded",
        },
      ]);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  }, [
    addMessages,
    increaseStress,
    input,
    loading,
    sessionId,
    selectedSuspectId,
    suspect,
    speakText,
    selectedEvidence,
    contradictoryEvidence,
    finalizeSpeechPlayback,
  ]);
  const revealedSubtitle = useMemo(
    () => revealSubtitleText(spokenSubtitle, speechElapsedMs, speaking),
    [spokenSubtitle, speechElapsedMs, speaking]
  );
  if (!sessionId || !activeSlot || !selectedSuspectId || !suspect) return null;
  const suggestedQuestions = buildSuggestedQuestions(
    suspect,
    messages,
    selectedEvidence,
    contradictoryEvidence,
    activeSlot.suspects,
    activeSlot,
    stress
  );
  return (
    <motion.div
      className="relative flex h-full min-h-0 flex-col overflow-hidden"
      initial={{ opacity: 0, x: 30 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -30 }}
      transition={{ duration: 0.4 }}
    >
      <InterrogationBackdrop
        stress={stress}
        particleBoost={contradictoryEvidence.length > 0 ? 1.2 : 0}
      />
      <div className="relative z-10 flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-[#2a2a3a] bg-[#060910]/95 px-5 py-2.5 font-mono shadow-[0_10px_32px_rgba(0,0,0,0.55)] backdrop-blur-md">
        <button
          onClick={() => goTo("manor")}
          className="text-label uppercase tracking-wider text-[#7d8796] transition-colors hover:text-[#e8e8e8]"
        >
          ← Back
        </button>
        <div className="flex items-center gap-4 text-[11px] uppercase tracking-[2.5px] text-[#e8e8e8]">
          <span className="text-[#b8860b]">Case File: {activeSlot.title}</span>
          <span className="text-[#516278]">|</span>
          <span>Subject: <span className="text-[#c0c0c0]">{suspect.name}</span></span>
          <span className="flex items-center gap-1.5 text-[#d7d7d7]">
            <span className="h-2 w-2 animate-pulse rounded-full bg-[#8b0000] shadow-[0_0_12px_rgba(139,0,0,0.85)]" />
            REC
          </span>
          <span className="border border-[#2a2a3a] bg-[#0a0e1a] px-2 py-1 text-[#b8860b]">
            {subjectStatus}
          </span>
        </div>
        <StressGauge stress={stress} suspectName={suspect.name} />
      </div>
      <div className="flex min-h-0 flex-1">
        <AvatarPanel
          suspect={suspect}
          stress={stress}
          speaking={speaking}
          stressed={stressed}
          characterTimestamps={characterTimestamps}
          visemeTimeline={visemeTimeline}
          speechElapsedMs={speechElapsedMs}
          spokenSubtitle={spokenSubtitle}
          revealedSubtitle={revealedSubtitle}
          onFocusInput={() => inputRef.current?.focus()}
        />
        <div className="flex min-w-0 flex-1">
          <div className="flex min-w-0 flex-1 flex-col">
          <div
            className={`flex-1 overflow-y-auto bg-[radial-gradient(circle_at_50%_10%,rgba(30,58,95,0.14),transparent_36%),linear-gradient(180deg,rgba(10,14,26,0.96),rgba(4,6,11,0.98))] px-6 py-5 shadow-[inset_0_0_90px_rgba(0,0,0,0.42)] ${stress >= 75 ? "stress-ui-shake" : ""}`}
          >
            {contradictoryEvidence.length > 0 ? (
              <div className="mb-3 border border-[#8b0000]/55 bg-[#120809]/85 px-3 py-2 font-mono text-label leading-relaxed tracking-[0.02em] text-[#ffb3a8] backdrop-blur-md shadow-[0_8px_24px_rgba(139,0,0,0.16)]">
                Pressure point active: selected evidence points at this suspect. Their next answer should sound more defensive.
              </div>
            ) : null}
            {messages.length === 0 && !displayText && (
              <div className="flex h-full items-center justify-center text-center font-mono text-body italic text-[#616b78]">
                Start questioning {suspect.name}.
              </div>
            )}
            <ConversationPanel
              messages={messages}
              activeMessage={displayText}
              isRevealing={Boolean(displayText)}
              suspectName={suspect.name}
              stress={stress}
              detectiveInstinct={instinct}
              bottomRef={bottomRef}
              evidence={activeSlot.evidence}
              contradictsEvidence={contradictsEvidence}
              streamKey={streamKey}
            />
          </div>
          <SuggestedQuestions questions={suggestedQuestions} onSelect={setInput} isLoading={loading} />
          <ControlPanel value={input} onChange={setInput} onSubmit={() => void sendMessage()} isLoading={loading} placeholder={`Question ${suspect.name}...`} inputRef={inputRef} />
          </div>
          <CaseTimeline
            suspectName={suspect.name}
            messages={messages}
            activeSlot={activeSlot}
            discoveredEvidence={discoveredEvidence}
            contradictoryEvidence={contradictoryEvidence}
            contradictsEvidence={contradictsEvidence}
            allEvidence={activeSlot.evidence}
            isLoading={loading}
            activeStreamingText={displayText}
          />
          <EvidenceBoard />
        </div>
      </div>
      </div>
    </motion.div>
  );
}
