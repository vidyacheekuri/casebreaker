"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { useGameStore } from "@/lib/store";
import { getSuspect, HARLOW_MANOR } from "@/lib/cases/harlow-manor";
import type { SuspectId, EvidenceId } from "@/lib/cases/harlow-manor";
import type { Message } from "@/lib/store";

const SUGGESTED_QUESTIONS: Record<SuspectId, string[]> = {
  fenn: [
    "Where were you when Edmund died?",
    "Tell me about your medical bag.",
    "Did you notice anything unusual last night?",
    "What is your relationship with Victoria Harlow?",
  ],
  victoria: [
    "Where were you between 9 and 10 PM?",
    "Tell me about Edmund's will.",
    "Did you enter the guest wing last night?",
    "How would you describe your marriage?",
  ],
  oliver: [
    "Tell me about your argument with Edmund.",
    "What do you owe the moneylenders?",
    "Did you see anyone when you left the library?",
    "Where were you after leaving Edmund?",
  ],
};

function SuspectPortrait({ suspectId, stressed }: { suspectId: SuspectId; stressed: boolean }) {
  const suspect = getSuspect(suspectId);
  const colors: Record<SuspectId, string> = {
    fenn: "#4A6670",
    victoria: "#6B4A5A",
    oliver: "#4A5A6B",
  };

  return (
    <div className="relative flex flex-col items-center justify-end h-full pb-6">
      {/* Spotlight */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: stressed
            ? "radial-gradient(ellipse at 50% 30%, rgba(200,80,40,.1) 0%, transparent 65%)"
            : "radial-gradient(ellipse at 50% 30%, rgba(255,248,200,.05) 0%, transparent 65%)",
        }}
      />

      {/* Silhouette */}
      <div
        className="relative flex flex-col items-center justify-center rounded-full mb-4"
        style={{
          width: 140,
          height: 140,
          background: `radial-gradient(circle at 40% 40%, ${colors[suspectId]}44, ${colors[suspectId]}22)`,
          border: `1px solid ${colors[suspectId]}44`,
        }}
      >
        <div
          className="text-3xl font-bold tracking-wider"
          style={{ color: colors[suspectId], fontFamily: "Georgia, serif", opacity: 0.7 }}
        >
          {suspect.portrait}
        </div>
      </div>

      {/* Name + status */}
      <div className="text-center z-10">
        <div className="text-sm font-semibold tracking-[2px] uppercase text-[#E8E0D0]"
          style={{ fontFamily: "Georgia, serif" }}>
          {suspect.name}
        </div>
        <div className="text-[10px] text-[#D4A843] mt-1 tracking-wider">
          {stressed ? "Visibly tense" : "Composed"}
        </div>
        <div className="text-[9px] text-[#445566] mt-0.5 italic">{suspect.occupation}</div>
      </div>
    </div>
  );
}

export default function InterrogationRoom() {
  const {
    selectedSuspect,
    goTo,
    discoveredEvidence,
    suspectStress,
    interrogationHistories,
    addMessages,
    increaseStress,
  } = useGameStore();

  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [displayText, setDisplayText] = useState("");
  const [speaking, setSpeaking] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const audioEnabled = useRef(true);

  if (!selectedSuspect) {
    goTo("manor");
    return null;
  }

  const suspect = getSuspect(selectedSuspect);
  const messages: Message[] = interrogationHistories[selectedSuspect] ?? [];
  const stress = suspectStress[selectedSuspect] ?? 0;
  const stressed = stress >= 40;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, displayText]);

  const speakText = useCallback(async (text: string) => {
    if (!audioEnabled.current) return;
    setSpeaking(true);
    const safetyTimer = setTimeout(() => setSpeaking(false), Math.max(8000, text.length * 80));
    try {
      const res = await fetch("/api/speak", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, voiceId: suspect.voiceId }),
      });
      if (!res.ok) throw new Error("speak unavailable");
      const { audio } = await res.json();
      const el = new Audio(`data:audio/mpeg;base64,${audio}`);
      el.onended = () => { clearTimeout(safetyTimer); setSpeaking(false); };
      el.onerror = () => { clearTimeout(safetyTimer); setSpeaking(false); };
      el.play().catch(() => { clearTimeout(safetyTimer); setSpeaking(false); });
    } catch {
      if ("speechSynthesis" in window) {
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 0.9; utterance.pitch = 0.85; utterance.lang = "en-GB";
        utterance.onend = () => { clearTimeout(safetyTimer); setSpeaking(false); };
        window.speechSynthesis.speak(utterance);
      } else {
        clearTimeout(safetyTimer); setSpeaking(false);
      }
    }
  }, [suspect.voiceId]);

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || loading) return;

    const userMsg: Message = { role: "user", content: text };
    addMessages(selectedSuspect, [userMsg]);
    setInput("");
    setLoading(true);
    setDisplayText("");

    try {
      const res = await fetch("/api/interrogate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          suspectId: selectedSuspect,
          question: text,
          history: messages.map((m) => ({ role: m.role, content: m.content })),
          discoveredEvidence: discoveredEvidence as EvidenceId[],
          stressLevel: stress,
        }),
      });

      if (!res.ok || !res.body) throw new Error("Request failed");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let fullResponse = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value);
        for (const line of chunk.split("\n")) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6);
          if (data === "[DONE]") break;
          try {
            const parsed = JSON.parse(data);
            if (parsed.type === "meta" && parsed.stressImpact > 0) {
              increaseStress(selectedSuspect, parsed.stressImpact);
            } else if (parsed.type === "token" && parsed.text) {
              fullResponse += parsed.text;
              setDisplayText(fullResponse);
            }
          } catch { /* skip */ }
        }
      }

      const assistantMsg: Message = { role: "assistant", content: fullResponse };
      addMessages(selectedSuspect, [assistantMsg]);
      setDisplayText("");
      speakText(fullResponse);
    } catch {
      setSpeaking(false);
      setDisplayText("");
      addMessages(selectedSuspect, [{
        role: "assistant",
        content: `${suspect.name} falls silent. The connection was lost.`,
      }]);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  }, [input, loading, messages, selectedSuspect, discoveredEvidence, stress, addMessages, increaseStress, speakText, suspect.name]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  const suggested = SUGGESTED_QUESTIONS[selectedSuspect] ?? [];
  const stressQuestions: Record<SuspectId, string[]> = {
    fenn: ["I know about your feelings for Victoria.", "A strychnine vial is missing from your bag."],
    victoria: ["The amended will cuts you out entirely.", "You were seen in the guest wing at 9:10 PM."],
    oliver: ["We found your debt letter.", "What exactly did you argue about?"],
  };
  const highStressQs = stress >= 30 ? stressQuestions[selectedSuspect] : [];

  return (
    <motion.div
      className="flex flex-col h-full"
      initial={{ opacity: 0, x: 30 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -30 }}
      transition={{ duration: 0.4 }}
    >
      {/* Top bar */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-white/5">
        <button
          onClick={() => goTo("manor")}
          className="text-[10px] tracking-wider uppercase text-[#445566] hover:text-[#C8D0DC] transition-colors"
        >
          ← Manor
        </button>
        <div className="text-[10px] tracking-[3px] uppercase text-[#D4A843]">Interrogation Room</div>
        <div className="flex items-center gap-2">
          <div className="text-[9px] text-[#445566]">
            {stress >= 70 ? "Breaking" : stress >= 40 ? "Uneasy" : "Calm"}
          </div>
          <div className="w-20 h-1 rounded-full bg-white/5 overflow-hidden">
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

      <div className="flex flex-1 min-h-0">
        {/* Character panel */}
        <div className="relative w-[36%] flex-shrink-0 h-full border-r border-white/5">
          <SuspectPortrait suspectId={selectedSuspect} stressed={stressed} />
          {speaking && (
            <div className="absolute top-4 right-4 flex gap-1 items-end">
              {[4, 7, 5, 8, 4].map((h, i) => (
                <div
                  key={i}
                  className="w-0.5 rounded-full bg-[#D4A843]"
                  style={{ height: h, animation: `bounce ${0.4 + i * 0.1}s ease-in-out infinite alternate` }}
                />
              ))}
            </div>
          )}
        </div>

        {/* Dialogue panel */}
        <div className="flex flex-col flex-1 min-w-0">
          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
            {messages.length === 0 && !displayText && (
              <div className="flex flex-col items-center justify-center h-full text-center gap-3 opacity-50">
                <div className="text-[10px] tracking-[3px] uppercase text-[#D4A843]">
                  {suspect.name}
                </div>
                <p
                  className="text-xs italic text-[#445566] max-w-xs leading-relaxed"
                  style={{ fontFamily: "Georgia, serif" }}
                >
                  {selectedSuspect === "fenn" && "Dr. Fenn sits straight in his chair, hands folded. He meets your gaze without blinking."}
                  {selectedSuspect === "victoria" && "Victoria Harlow is already seated when you enter. She does not look up immediately."}
                  {selectedSuspect === "oliver" && "Oliver is pacing when you arrive. He stops, runs a hand through his hair."}
                </p>
                <p className="text-[9px] text-[#334455]">Type your question below</p>
              </div>
            )}

            {messages.map((msg, i) => (
              <div key={i} className="flex" style={{ justifyContent: msg.role === "user" ? "flex-end" : "flex-start" }}>
                {msg.role === "user" ? (
                  <div
                    className="max-w-[80%] px-3 py-2 rounded-[8px_8px_2px_8px] text-xs leading-relaxed"
                    style={{ background: "rgba(212,168,67,.1)", border: "1px solid rgba(212,168,67,.2)", color: "#D4A843" }}
                  >
                    {msg.content}
                  </div>
                ) : (
                  <div
                    className="max-w-[82%] px-3 py-2 rounded-[8px_8px_8px_2px] text-xs leading-relaxed"
                    style={{ background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.06)", color: "#C8D0DC", fontFamily: "Georgia, serif" }}
                  >
                    {msg.content}
                  </div>
                )}
              </div>
            ))}

            {displayText && (
              <div className="flex justify-start">
                <div
                  className="max-w-[82%] px-3 py-2 rounded-[8px_8px_8px_2px] text-xs leading-relaxed"
                  style={{ background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.06)", color: "#C8D0DC", fontFamily: "Georgia, serif" }}
                >
                  {displayText}
                  <span className="inline-block w-px h-3 bg-[#C8D0DC] ml-0.5 align-middle" style={{ animation: "blink .8s step-end infinite" }} />
                </div>
              </div>
            )}

            {loading && !displayText && (
              <div className="flex justify-start">
                <div className="px-3 py-2 text-[11px] italic text-[#334455]">
                  {suspect.name.split(" ")[0]} considers...
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input area */}
          <div className="border-t border-white/5 px-4 py-3">
            {stress >= 40 && (
              <div className="mb-2 text-[9px] tracking-wider uppercase text-[#FF9800] opacity-70">
                {stress >= 70 ? "On the verge of breaking." : "Growing visibly uneasy."}
              </div>
            )}
            <div className="flex gap-2 items-end">
              <input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={loading}
                placeholder={`Ask ${suspect.name.split(" ").slice(-1)[0]} anything...`}
                className="flex-1 bg-transparent border rounded-md px-3 py-2 text-xs outline-none transition-colors placeholder:text-[#334455] disabled:opacity-40"
                style={{ borderColor: loading ? "rgba(255,255,255,.05)" : "rgba(255,255,255,.12)", color: "#C8D0DC", fontFamily: "Georgia, serif" }}
                autoFocus
              />
              <button
                onClick={sendMessage}
                disabled={loading || !input.trim()}
                className="px-4 py-2 rounded-md text-xs font-semibold transition-all disabled:opacity-30"
                style={{ background: "rgba(212,168,67,.12)", border: "1px solid rgba(212,168,67,.3)", color: "#D4A843" }}
              >
                Ask →
              </button>
            </div>

            {/* Suggested questions */}
            <div className="flex flex-wrap gap-1.5 mt-2">
              {[...suggested, ...highStressQs].map((q) => (
                <button
                  key={q}
                  onClick={() => { setInput(q); inputRef.current?.focus(); }}
                  disabled={loading}
                  className="text-[10px] px-2.5 py-1 rounded transition-colors disabled:opacity-30"
                  style={{ background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.07)", color: "#667788" }}
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes blink { 50% { opacity: 0; } }
        @keyframes bounce { from { transform: scaleY(0.5); } to { transform: scaleY(1.5); } }
        ::-webkit-scrollbar { width: 3px; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,.08); border-radius: 2px; }
      `}</style>
    </motion.div>
  );
}
