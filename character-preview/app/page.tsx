"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import dynamic from "next/dynamic";
import { CHARACTER_NAME, DEFAULT_STORY_ID } from "@/lib/character";
import {
  approxVisemeTimelineFromText,
  type CharacterTimestampRange,
  type VisemeTimeline,
} from "@/lib/character-pipeline";
import { ErrorBoundary } from "@/components/ErrorBoundary";

const CharacterCanvas = dynamic(() => import("@/components/CharacterCanvas"), {
  ssr: false,
  loading: () => <div className="flex items-center justify-center h-full text-[#445566] text-xs">Loading 3D...</div>,
});

interface Message {
  role: "user" | "assistant";
  content: string;
}

const MODEL_PATHS = {
  brian: "/models/brian.glb",
  character: "/models/character.glb",
  drFennTripo: "/models/dr_fenn_tripo.glb",
} as const;
const ACTIVE_MODEL: keyof typeof MODEL_PATHS = "brian";
const MODEL_PATH = MODEL_PATHS[ACTIVE_MODEL];
const CONTROL_VALIDATION_MODE = false;

export default function PreviewPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [speaking, setSpeaking] = useState(false);
  const [loading, setLoading] = useState(false);
  const [displayText, setDisplayText] = useState("");
  const [stressed, setStressed] = useState(false);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [tripoModelUrl, setTripoModelUrl] = useState<string | null>(null);
  const [useGeneratedModel, setUseGeneratedModel] = useState(false);
  const [tripoStatus, setTripoStatus] = useState<
    "idle" | "generating" | "ready" | "error"
  >("idle");
  const [tripoTaskId, setTripoTaskId] = useState<string | null>(null);
  const [tripoError, setTripoError] = useState<string | null>(null);
  const [visemeTimeline, setVisemeTimeline] = useState<VisemeTimeline | null>(
    null
  );
  const [characterTimestamps, setCharacterTimestamps] = useState<
    CharacterTimestampRange[] | null
  >(null);
  const [speechElapsedMs, setSpeechElapsedMs] = useState(0);
  const hasLoggedSpeakingTrueRef = useRef(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const speechRafRef = useRef<number | null>(null);
  const activeModelPath =
    useGeneratedModel && tripoModelUrl ? tripoModelUrl : MODEL_PATH;

  useEffect(() => {
    // #region agent log
    fetch("http://127.0.0.1:7646/ingest/6ad1a864-56ce-462c-9062-248741f1b63d", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Debug-Session-Id": "579b81",
      },
      body: JSON.stringify({
        sessionId: "579b81",
        runId: "pre-fix",
        hypothesisId: "H1",
        location: "app/page.tsx:activeModelPathEffect",
        message: "Active model selection state",
        data: {
          modelPath: activeModelPath,
          useGeneratedModel,
          hasTripoModelUrl: Boolean(tripoModelUrl),
          tripoStatus,
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
  }, [activeModelPath, useGeneratedModel, tripoModelUrl, tripoStatus]);

  const stressCount = messages.filter(
    (m) =>
      m.role === "user" &&
      (m.content.toLowerCase().includes("strychnine") ||
        m.content.toLowerCase().includes("victoria") ||
        m.content.toLowerCase().includes("lying") ||
        m.content.toLowerCase().includes("truth") ||
        m.content.toLowerCase().includes("bag") ||
        m.content.toLowerCase().includes("love") ||
        m.content.toLowerCase().includes("know you"))
  ).length;

  useEffect(() => { setStressed(stressCount >= 2); }, [stressCount]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, displayText]);
  useEffect(() => {
    if (!speaking) {
      hasLoggedSpeakingTrueRef.current = false;
      return;
    }
    if (hasLoggedSpeakingTrueRef.current) return;
    // #region agent log
    fetch("http://127.0.0.1:7646/ingest/6ad1a864-56ce-462c-9062-248741f1b63d", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Debug-Session-Id": "579b81",
      },
      body: JSON.stringify({
        sessionId: "579b81",
        runId: "pre-fix",
        hypothesisId: "H7",
        location: "app/page.tsx:speakingStateEffect",
        message: "Speaking state turned true",
        data: {
          audioEnabled,
          hasVisemeTimeline: Boolean(visemeTimeline?.events?.length),
          characterTimestampCount: characterTimestamps?.length ?? 0,
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
    hasLoggedSpeakingTrueRef.current = true;
  }, [speaking, audioEnabled, visemeTimeline, characterTimestamps]);

  const generateTripoModel = useCallback(async () => {
    setTripoStatus("generating");
    setTripoError(null);
    setTripoTaskId(null);

    try {
      const res = await fetch("/api/tripo-model");
      const data = (await res.json()) as {
        modelUrl?: string;
        source?: string;
        taskId?: string;
        error?: string;
      };

      if (!res.ok || !data.modelUrl || data.source === "fallback") {
        const errorMessage =
          data.error ?? `Tripo generation failed (HTTP ${res.status})`;
        throw new Error(errorMessage);
      }

      setTripoModelUrl(data.modelUrl);
      setTripoTaskId(data.taskId ?? null);
      setUseGeneratedModel(true);
      setTripoStatus("ready");
    } catch (error) {
      setTripoStatus("error");
      setUseGeneratedModel(false);
      setTripoError(error instanceof Error ? error.message : "Unknown Tripo error");
    }
  }, []);

  // Use browser speech synthesis as free fallback, ElevenLabs if available
  const speakText = useCallback((text: string) => {
    if (!audioEnabled) return;

    setSpeaking(true);
    setSpeechElapsedMs(0);
    setVisemeTimeline(null);
    setCharacterTimestamps(null);

    // Safety timeout — never stay in "speaking" state forever
    const maxDuration = Math.max(8000, text.length * 80); // ~80ms per char
    const safetyTimer = setTimeout(() => setSpeaking(false), maxDuration);
    const stopClock = () => {
      if (speechRafRef.current !== null) {
        cancelAnimationFrame(speechRafRef.current);
        speechRafRef.current = null;
      }
    };
    const stop = () => {
      stopClock();
      clearTimeout(safetyTimer);
      setSpeaking(false);
      setSpeechElapsedMs(0);
    };
    const startClock = () => {
      stopClock();
      const start = performance.now();
      const tick = () => {
        setSpeechElapsedMs(performance.now() - start);
        speechRafRef.current = requestAnimationFrame(tick);
      };
      speechRafRef.current = requestAnimationFrame(tick);
    };

    // Try ElevenLabs first
    fetch("/api/speak", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    })
      .then((res) => {
        if (!res.ok) throw new Error("ElevenLabs unavailable");
        return res.json();
      })
      .then(({ audio, visemeTimeline: timeline, characterTimestamps: ranges }) => {
        // #region agent log
        fetch("http://127.0.0.1:7646/ingest/6ad1a864-56ce-462c-9062-248741f1b63d", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Debug-Session-Id": "579b81",
          },
          body: JSON.stringify({
            sessionId: "579b81",
            runId: "pre-fix",
            hypothesisId: "H8",
            location: "app/page.tsx:speakTextThen",
            message: "ElevenLabs speak payload received",
            data: {
              hasAudio: Boolean(audio),
              visemeEventCount: timeline?.events?.length ?? 0,
              characterTimestampCount: Array.isArray(ranges) ? ranges.length : 0,
            },
            timestamp: Date.now(),
          }),
        }).catch(() => {});
        // #endregion
        if (timeline) {
          setVisemeTimeline(timeline as VisemeTimeline);
        }
        if (Array.isArray(ranges)) {
          setCharacterTimestamps(ranges as CharacterTimestampRange[]);
        }
        const el = new Audio(`data:audio/mpeg;base64,${audio}`);
        el.onplay = startClock;
        el.onended = stop;
        el.onerror = stop;
        el.play().catch(stop);
      })
      .catch(() => {
        // #region agent log
        fetch("http://127.0.0.1:7646/ingest/6ad1a864-56ce-462c-9062-248741f1b63d", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Debug-Session-Id": "579b81",
          },
          body: JSON.stringify({
            sessionId: "579b81",
            runId: "pre-fix",
            hypothesisId: "H9",
            location: "app/page.tsx:speakTextCatch",
            message: "ElevenLabs failed, using browser fallback path",
            data: {
              audioEnabled,
            },
            timestamp: Date.now(),
          }),
        }).catch(() => {});
        // #endregion
        // Fallback: browser speech synthesis (free, no API key)
        if ("speechSynthesis" in window) {
          // Keep flap-sync active even when ElevenLabs is unavailable.
          setVisemeTimeline(approxVisemeTimelineFromText(text, "browser-speech-fallback", 70));
          const utterance = new SpeechSynthesisUtterance(text);
          utterance.rate = 0.9;
          utterance.pitch = 0.85;
          utterance.lang = "en-GB";
          utterance.onend = stop;
          utterance.onerror = stop;
          startClock();
          window.speechSynthesis.speak(utterance);
        } else {
          stop();
        }
      });
  }, [audioEnabled]);

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || loading) return;

    const userMsg: Message = { role: "user", content: text };
    const newHistory = [...messages, userMsg];
    setMessages(newHistory);
    setInput("");
    setLoading(true);
    setDisplayText("");

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          history: messages.map((m) => ({ role: m.role, content: m.content })),
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Request failed" }));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      if (!res.body) throw new Error("No stream");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let fullResponse = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split("\n");
        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6);
            if (data === "[DONE]") break;
            try {
              const { text: token } = JSON.parse(data);
              fullResponse += token;
              setDisplayText(fullResponse);
            } catch { /* skip malformed SSE chunks */ }
          }
        }
      }

      const assistantMsg: Message = { role: "assistant", content: fullResponse };
      setMessages([...newHistory, assistantMsg]);
      setDisplayText("");

      speakText(fullResponse);
    } catch {
      // Reset speaking immediately — prevents the 3D model from staying
      // stuck in its speaking animation when the API fails.
      setSpeaking(false);
      setVisemeTimeline(null);
      setCharacterTimestamps(null);
      setSpeechElapsedMs(0);
      setDisplayText("");
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "System: Dr. Fenn is silent... The connection was lost. Try again." },
      ]);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  }, [input, loading, messages, speakText]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="flex flex-col h-screen bg-[#070E1A] text-[#C8D0DC] overflow-hidden" style={{ fontFamily: "'Georgia', serif" }}>

      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-white/5 bg-[#070E1A]/90 backdrop-blur-md z-10">
        <span className="text-[10px] tracking-[4px] uppercase text-[#D4A843] font-semibold">CaseBreaker AI</span>
        <span className="text-sm text-[#445566] italic">Harlow Manor, Devon — 1923</span>
        <div className="flex items-center gap-2">
          <button
            onClick={generateTripoModel}
            disabled={tripoStatus === "generating"}
            className="text-[10px] tracking-widest uppercase px-3 py-1 rounded border transition-colors disabled:opacity-50"
            style={{
              borderColor: "rgba(120,190,255,0.5)",
              color: "#78beff",
            }}
          >
            {tripoStatus === "generating" ? "Generating..." : "Load/Generate Dr. Fenn"}
          </button>
          <button
            onClick={() => setUseGeneratedModel((v) => !v)}
            disabled={!tripoModelUrl}
            className="text-[10px] tracking-widest uppercase px-3 py-1 rounded border transition-colors disabled:opacity-30"
            style={{
              borderColor: tripoModelUrl
                ? "rgba(150,200,150,0.5)"
                : "rgba(255,255,255,0.1)",
              color: tripoModelUrl ? "#a4d4a4" : "#445566",
            }}
          >
            {useGeneratedModel ? "Using Tripo" : "Use Tripo"}
          </button>
          <button
            onClick={() => setAudioEnabled((v) => !v)}
            className="text-[10px] tracking-widest uppercase px-3 py-1 rounded border transition-colors"
            style={{
              borderColor: audioEnabled
                ? "rgba(212,168,67,0.4)"
                : "rgba(255,255,255,0.1)",
              color: audioEnabled ? "#D4A843" : "#445566",
            }}
          >
            {audioEnabled ? "Voice On" : "Voice Off"}
          </button>
        </div>
      </div>

      <div className="flex flex-1 min-h-0">

        {/* Character Panel */}
        <div className="relative isolate w-[38%] flex-shrink-0 h-full">
          {/* Spotlight glow */}
          {!CONTROL_VALIDATION_MODE && (
            <div
              className="absolute inset-0 pointer-events-none z-0"
              style={{
                background: stressed
                  ? "radial-gradient(ellipse at 50% 35%, rgba(200,80,40,.12) 0%, transparent 65%)"
                  : "radial-gradient(ellipse at 50% 35%, rgba(255,248,200,.06) 0%, transparent 65%)",
              }}
            />
          )}

          {/* Ceiling lamp */}
          {!CONTROL_VALIDATION_MODE && (
            <div className="absolute top-0 left-1/2 -translate-x-1/2 flex flex-col items-center pointer-events-none z-10">
              <div className="w-px h-8 bg-white/10" />
              <div className="w-6 h-3 rounded-full bg-[#1a1a1a] border border-white/10" />
            </div>
          )}

          {/* 3D canvas — takes full panel, always mounted */}
          <div className="absolute inset-0" style={{ zIndex: 20, pointerEvents: "auto" }}>
            <ErrorBoundary>
              <CharacterCanvas
                modelPath={activeModelPath}
                speaking={speaking}
                stressed={stressed}
                visemeTimeline={visemeTimeline}
                characterTimestamps={characterTimestamps}
                speechElapsedMs={speechElapsedMs}
              />
            </ErrorBoundary>
          </div>

          {/* Name + status overlay */}
          {!CONTROL_VALIDATION_MODE && (
            <div className="absolute bottom-6 left-0 right-0 text-center pointer-events-none z-10">
              <div className="text-sm font-semibold tracking-[3px] uppercase text-[#E8E0D0]">{CHARACTER_NAME}</div>
              <div className="text-[10px] text-[#D4A843] mt-1 tracking-wider">
                {speaking ? "Speaking..." : stressed ? "Visibly tense" : "Composed"}
              </div>
              <div className="text-[10px] mt-1 text-[#667788] tracking-wide">
                Story ID: {DEFAULT_STORY_ID}
              </div>
              <div className="text-[10px] mt-1 text-[#8899aa] tracking-wide">
                Tripo:{" "}
                {tripoStatus === "idle"
                  ? "not generated"
                  : tripoStatus === "generating"
                    ? "generating..."
                    : tripoStatus === "ready"
                      ? `ready${tripoTaskId ? ` (${tripoTaskId.slice(0, 8)})` : ""}`
                      : "error"}
              </div>
              {tripoError && (
                <div className="text-[10px] mt-1 text-[#ff8c8c] tracking-wide">
                  {tripoError}
                </div>
              )}
              <div className="mx-auto mt-2 w-32 h-1 rounded-full bg-white/5 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{
                    width: `${Math.min(100, stressCount * 20)}%`,
                    background: stressCount >= 3 ? "#f44336" : stressCount >= 2 ? "#FF9800" : "#4CAF50",
                    boxShadow: stressCount >= 3 ? "0 0 8px #f44336" : "none",
                  }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Dialogue + Input Panel */}
        <div className="flex flex-col flex-1 min-w-0 border-l border-white/5">

          {/* Dialogue history */}
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
            {messages.length === 0 && !displayText && (
              <div className="flex flex-col items-center justify-center h-full text-center gap-3 opacity-50">
                <div className="text-[10px] tracking-[4px] uppercase text-[#D4A843]">Interrogation Room</div>
                <p className="text-sm italic text-[#445566] max-w-xs leading-relaxed">
                  Dr. Fenn sits across from you. The room is silent save for the rain against the windows.
                </p>
                <p className="text-[10px] text-[#334455] mt-2">Type your question below and press Enter</p>
              </div>
            )}

            {messages.map((msg, i) => (
              <div key={i} className="flex" style={{ justifyContent: msg.role === "user" ? "flex-end" : "flex-start" }}>
                {msg.role === "user" ? (
                  <div className="max-w-[80%] px-4 py-2 rounded-[10px_10px_2px_10px] text-sm leading-relaxed"
                    style={{ background: "rgba(212,168,67,.1)", border: "1px solid rgba(212,168,67,.2)", color: "#D4A843" }}>
                    {msg.content}
                  </div>
                ) : (
                  <div className="max-w-[80%] px-4 py-3 rounded-[10px_10px_10px_2px] text-sm leading-relaxed"
                    style={{ background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.06)", color: "#C8D0DC" }}>
                    {msg.content}
                  </div>
                )}
              </div>
            ))}

            {displayText && (
              <div className="flex justify-start">
                <div className="max-w-[80%] px-4 py-3 rounded-[10px_10px_10px_2px] text-sm leading-relaxed"
                  style={{ background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.06)", color: "#C8D0DC" }}>
                  {displayText}
                  <span className="inline-block w-px h-4 bg-[#C8D0DC] ml-0.5 align-middle" style={{ animation: "blink .8s step-end infinite" }} />
                </div>
              </div>
            )}

            {loading && !displayText && (
              <div className="flex justify-start">
                <div className="px-4 py-3 rounded-lg" style={{ color: "#445566", fontSize: 12, fontStyle: "italic" }}>
                  Dr. Fenn considers his words...
                </div>
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          {/* Input area */}
          <div className="border-t border-white/5 px-5 py-4">
            {stressCount >= 2 && (
              <div className="mb-3 text-[10px] tracking-wider uppercase text-[#FF9800] opacity-70">
                {stressCount >= 4 ? "He is on the verge of breaking." : "He is growing visibly uneasy."}
              </div>
            )}
            <div className="flex gap-3 items-end">
              <input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={loading}
                placeholder="Ask Dr. Fenn anything..."
                className="flex-1 bg-transparent border rounded-md px-4 py-3 text-sm outline-none transition-colors placeholder:text-[#334455] disabled:opacity-40"
                style={{ borderColor: loading ? "rgba(255,255,255,.05)" : "rgba(255,255,255,.12)", color: "#C8D0DC", fontFamily: "inherit" }}
                autoFocus
              />
              <button
                onClick={sendMessage}
                disabled={loading || !input.trim()}
                className="px-5 py-3 rounded-md text-sm font-semibold tracking-wider transition-all disabled:opacity-30"
                style={{ background: "rgba(212,168,67,.12)", border: "1px solid rgba(212,168,67,.3)", color: "#D4A843", cursor: loading || !input.trim() ? "not-allowed" : "pointer" }}
              >
                Ask →
              </button>
            </div>

            <div className="flex flex-wrap gap-2 mt-3">
              {[
                "Where were you last night?",
                "Tell me about Edmund.",
                "What about the brandy glass?",
                ...(stressCount >= 1 ? ["I know you're hiding something."] : []),
                ...(stressCount >= 2 ? ["I think you were in love with Victoria."] : []),
              ].map((hint) => (
                <button
                  key={hint}
                  onClick={() => { setInput(hint); inputRef.current?.focus(); }}
                  disabled={loading}
                  className="text-[11px] px-3 py-1 rounded-md transition-colors disabled:opacity-30"
                  style={{ background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.08)", color: "#667788", cursor: "pointer", fontFamily: "inherit" }}
                >
                  {hint}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes blink { 50% { opacity: 0; } }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,.1); border-radius: 2px; }
      `}</style>
    </div>
  );
}
