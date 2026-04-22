"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import dynamic from "next/dynamic";
import { motion } from "framer-motion";
import { interrogateSession } from "@/lib/backend-client";
import { useGameStore } from "@/lib/store";
import type { DetectiveInstinctDto, SuspectDto } from "@/lib/backend-types";
import SpeakingAura from "@/components/characters/SpeakingAura";

const AvatarCanvas = dynamic(() => import("@/components/characters/AvatarCanvas"), { ssr: false });

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

function stressImpactFromTone(tone: string): number {
  const normalized = tone.trim().toLowerCase();
  return TONE_STRESS_IMPACT[normalized] ?? 5;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function revealByWords(text: string, onChunk: (value: string) => void): Promise<void> {
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

function buildSuggestedQuestions(suspect: SuspectDto): string[] {
  return [
    "Where were you at the time of the death?",
    "Walk me through your alibi in detail.",
    `How would you describe your relationship to the victim (${suspect.relationship_to_victim})?`,
    `What are you leaving out about that night?`,
  ];
}

function SuspectLabel({ suspect, stressed }: { suspect: SuspectDto; stressed: boolean }) {
  return (
    <div className="pointer-events-none absolute bottom-0 left-0 right-0 flex flex-col items-center pb-5" style={{ zIndex: 20 }}>
      <div className="text-sm font-semibold uppercase tracking-[2px] text-[#E8E0D0]" style={{ fontFamily: "Georgia, serif" }}>
        {suspect.name}
      </div>
      <div className="mt-1 text-[10px] tracking-wider text-[#D4A843]">{stressed ? "Visibly tense" : "Composed"}</div>
      <div className="mt-0.5 text-[9px] italic text-[#445566]">{suspect.occupation}</div>
    </div>
  );
}

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
  } = useGameStore();

  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [displayText, setDisplayText] = useState("");
  const [speaking, setSpeaking] = useState(false);
  const [instinct, setInstinct] = useState<DetectiveInstinctDto | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const audioEnabled = useRef(true);

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

  const speakText = useCallback(
    async (text: string) => {
      if (!audioEnabled.current || !text.trim()) {
        return;
      }

      setSpeaking(true);
      const timeout = window.setTimeout(() => setSpeaking(false), Math.max(9000, text.length * 80));

      try {
        const response = await fetch("/api/speak", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, voiceId: suspect?.voice_id ?? undefined }),
        });

        if (!response.ok) {
          throw new Error("speak unavailable");
        }

        const payload = (await response.json()) as { audio?: string };
        if (!payload.audio) {
          throw new Error("missing audio");
        }

        const audio = new Audio(`data:audio/mpeg;base64,${payload.audio}`);
        audio.onended = () => {
          window.clearTimeout(timeout);
          setSpeaking(false);
        };
        audio.onerror = () => {
          window.clearTimeout(timeout);
          setSpeaking(false);
        };

        await audio.play();
      } catch {
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 0.92;
        utterance.pitch = 0.9;
        utterance.onend = () => {
          window.clearTimeout(timeout);
          setSpeaking(false);
        };
        utterance.onerror = () => {
          window.clearTimeout(timeout);
          setSpeaking(false);
        };
        window.speechSynthesis.speak(utterance);
      }
    },
    [suspect]
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
        message: text,
      });

      increaseStress(selectedSuspectId, stressImpactFromTone(response.tone));

      await revealByWords(response.reply, setDisplayText);

      addMessages(selectedSuspectId, [
        {
          role: "assistant",
          content: response.reply,
          tone: response.tone,
        },
      ]);

      setDisplayText("");
      setInstinct(response.detective_instinct);
      void speakText(response.reply);
    } catch {
      setDisplayText("");
      setSpeaking(false);
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
  ]);

  if (!sessionId || !activeSlot || !selectedSuspectId || !suspect) {
    return null;
  }

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void sendMessage();
    }
  };

  const suggestedQuestions = buildSuggestedQuestions(suspect);

  return (
    <motion.div
      className="flex h-full flex-col"
      initial={{ opacity: 0, x: 30 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -30 }}
      transition={{ duration: 0.4 }}
    >
      <div className="flex items-center justify-between border-b border-white/5 px-5 py-3">
        <button
          onClick={() => goTo("manor")}
          className="text-[10px] uppercase tracking-wider text-[#445566] transition-colors hover:text-[#C8D0DC]"
        >
          ← Back
        </button>
        <div className="text-[10px] uppercase tracking-[3px] text-[#D4A843]">Interrogation</div>
        <div className="flex items-center gap-2">
          <div className="text-[9px] text-[#445566]">
            {stress >= 70 ? "Breaking" : stress >= 40 ? "Uneasy" : "Calm"}
          </div>
          <div className="h-1 w-20 overflow-hidden rounded-full bg-white/5">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${stress}%`,
                background: stress >= 70 ? "#f44336" : stress >= 40 ? "#FF9800" : "#4CAF50",
              }}
            />
          </div>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        <div className="relative h-full w-[36%] flex-shrink-0 overflow-hidden border-r border-white/5">
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background: stressed
                ? "radial-gradient(ellipse at 50% 30%, rgba(200,80,40,.08) 0%, transparent 65%)"
                : "radial-gradient(ellipse at 50% 30%, rgba(255,248,200,.04) 0%, transparent 65%)",
              zIndex: 5,
            }}
          />
          <AvatarCanvas
            speaking={speaking}
            modelPath={suspect.model_path}
            modelUrl={suspect.model_url}
          />
          <SpeakingAura speaking={speaking} />
          <SuspectLabel suspect={suspect} stressed={stressed} />
        </div>

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="border-b border-white/5 px-4 py-2">
            <div className="text-[10px] uppercase tracking-[2px] text-[#334455]">Suggested prompts</div>
            <div className="mt-2 flex flex-wrap gap-2">
              {suggestedQuestions.map((question) => (
                <button
                  key={question}
                  onClick={() => setInput(question)}
                  className="rounded border border-white/10 bg-white/[0.02] px-2 py-1 text-[10px] text-[#8899AA] transition-colors hover:border-[#D4A843]/40 hover:text-[#D4A843]"
                >
                  {question}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-4">
            {messages.length === 0 && !displayText && (
              <div className="flex h-full items-center justify-center text-center text-xs italic text-[#445566]" style={{ fontFamily: "Georgia, serif" }}>
                Start questioning {suspect.name}.
              </div>
            )}

            <div className="space-y-3">
              {messages.map((message, index) => (
                <div
                  key={`${message.role}-${index}-${message.content.slice(0, 12)}`}
                  className={`max-w-[85%] rounded-md border px-3 py-2 text-xs leading-relaxed ${
                    message.role === "user" ? "ml-auto" : ""
                  }`}
                  style={{
                    borderColor:
                      message.role === "user" ? "rgba(100,140,210,.35)" : "rgba(212,168,67,.28)",
                    background:
                      message.role === "user" ? "rgba(100,140,210,.11)" : "rgba(212,168,67,.08)",
                    color: "#D8DEE8",
                    fontFamily: "Georgia, serif",
                  }}
                >
                  <div className="mb-1 text-[9px] uppercase tracking-wider text-[#77889A]">
                    {message.role === "user" ? "Detective" : suspect.name}
                    {message.tone ? ` · ${message.tone}` : ""}
                  </div>
                  {message.content}
                </div>
              ))}

              {displayText && (
                <div
                  className="max-w-[85%] rounded-md border border-[rgba(212,168,67,.28)] bg-[rgba(212,168,67,.08)] px-3 py-2 text-xs leading-relaxed text-[#D8DEE8]"
                  style={{ fontFamily: "Georgia, serif" }}
                >
                  <div className="mb-1 text-[9px] uppercase tracking-wider text-[#77889A]">{suspect.name}</div>
                  {displayText}
                  <span className="ml-1 animate-pulse">▌</span>
                </div>
              )}

              {instinct && (
                <div className="max-w-[95%] rounded border border-[#31506B] bg-[#102033] px-3 py-2 text-[11px] text-[#9EC6E8]">
                  <div className="mb-1 text-[9px] uppercase tracking-[2px] text-[#6CA8D6]">Detective Instinct</div>
                  <p className="italic">&quot;{instinct.quote}&quot;</p>
                  <div className="mt-1 text-[10px] text-[#7EAED0]">
                    {instinct.source_title} · {instinct.source_author}
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>
          </div>

          <div className="border-t border-white/5 px-4 py-3">
            <div className="flex gap-2">
              <input
                ref={inputRef}
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={`Question ${suspect.name}...`}
                className="flex-1 rounded border border-white/10 bg-white/[0.02] px-3 py-2 text-xs text-[#D8DEE8] outline-none placeholder:text-[#445566] focus:border-[#D4A843]/45"
              />
              <button
                onClick={() => {
                  void sendMessage();
                }}
                disabled={loading || !input.trim()}
                className="rounded border px-4 py-2 text-xs uppercase tracking-[2px] disabled:opacity-45"
                style={{
                  borderColor: "rgba(212,168,67,.35)",
                  background: "rgba(212,168,67,.08)",
                  color: "#D4A843",
                }}
              >
                {loading ? "Thinking..." : "Send"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
