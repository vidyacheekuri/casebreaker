"use client";

import { animated, useSpring } from "@react-spring/web";
import { useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent } from "react";
import type { SuspectDto } from "@/lib/backend-types";
import type { Message } from "@/lib/store";

interface SuspectCardProps {
  suspect: SuspectDto;
  stress: number;
  messages?: Message[];
  onInterrogate: () => void;
}

function initialsFor(name: string): string {
  return name
    .split(" ")
    .map((part) => part[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function toneFor(stress: number, latestTone?: string): string {
  if (latestTone) return latestTone.charAt(0).toUpperCase() + latestTone.slice(1).toLowerCase();
  if (stress >= 70) return "Defensive";
  if (stress >= 40) return "Nervous";
  return "Calm";
}

function timeLabel(timestamp?: string): string {
  if (!timestamp) return "Not questioned";

  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "This session";

  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export default function SuspectCard({ suspect, stress, messages = [], onInterrogate }: SuspectCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [pulse, setPulse] = useState(false);
  const previousStress = useRef(stress);

  const assistantMessages = useMemo(
    () => messages.filter((message) => message.role === "assistant"),
    [messages]
  );
  const latestAssistant = assistantMessages.at(-1);
  const latestTone = latestAssistant?.tone;
  const contradictions = assistantMessages.filter((message) =>
    ["evasive", "defensive", "nervous", "hostile", "guarded"].includes(message.tone?.toLowerCase() ?? "")
  ).length;
  const lastInterrogation = timeLabel(latestAssistant?.timestamp);
  const tone = toneFor(stress, latestTone);
  const stressRatio = Math.max(0, Math.min(100, stress)) / 100;
  const angry = Math.round(45 + stressRatio * 130);
  const calm = Math.round(160 - stressRatio * 90);

  const [{ rotateX, rotateY, scale }, api] = useSpring(() => ({
    rotateX: 0,
    rotateY: 0,
    scale: 1,
    config: { mass: 1, tension: 260, friction: 24 },
  }));

  useEffect(() => {
    if (stress > previousStress.current) {
      setPulse(true);
      const timeout = window.setTimeout(() => setPulse(false), 900);
      previousStress.current = stress;
      return () => window.clearTimeout(timeout);
    }
    previousStress.current = stress;
  }, [stress]);

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    if (event.pointerType === "touch") return;

    const bounds = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - bounds.left) / bounds.width - 0.5;
    const y = (event.clientY - bounds.top) / bounds.height - 0.5;

    api.start({
      rotateX: y * -9,
      rotateY: x * 11,
      scale: 1.015,
    });
  }

  function resetTilt() {
    api.start({ rotateX: 0, rotateY: 0, scale: 1 });
  }

  return (
    <animated.div
      role="button"
      tabIndex={0}
      onClick={() => setExpanded((value) => !value)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          setExpanded((value) => !value);
        }
      }}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => {
        setHovered(false);
        resetTilt();
      }}
      onPointerMove={handlePointerMove}
      className={[
        "suspect-card group relative min-h-[235px] cursor-pointer overflow-hidden border border-white/10 p-4 text-left outline-none",
        "backdrop-blur-md transition-[border-color,box-shadow,filter] duration-300",
        "hover:shadow-[0_14px_44px_rgba(212,168,67,0.12),0_0_32px_rgba(95,145,230,0.08)]",
        pulse ? "suspect-card-pulse" : "",
        stress >= 70 ? "suspect-card-shake" : "",
      ].join(" ")}
      style={{
        transformStyle: "preserve-3d",
        rotateX,
        rotateY,
        scale,
        borderColor: `rgba(212,168,67,${0.16 + stressRatio * 0.42})`,
        background: `
          radial-gradient(circle at 82% 10%, rgba(${angry},42,42,${0.06 + stressRatio * 0.12}), transparent 34%),
          linear-gradient(135deg, rgba(10,22,38,.72), rgba(${angry},${calm},84,${0.1 + stressRatio * 0.14}) 58%, rgba(7,14,26,.75))
        `,
        boxShadow: `
          0 18px 45px rgba(0,0,0,.28),
          0 0 ${10 + stressRatio * 26}px rgba(212,168,67,${0.05 + stressRatio * 0.22}),
          inset 0 1px 0 rgba(255,255,255,.05)
        `,
      }}
    >
      <div className="pointer-events-none absolute inset-x-5 top-0 h-px bg-gradient-to-r from-transparent via-[#D4A843]/50 to-transparent" />
      <div className="pointer-events-none absolute -right-10 bottom-0 h-40 w-32 rounded-t-full bg-black/20 blur-2xl" />

      <div className="relative z-10 flex items-start gap-4">
        <div
          className="suspect-portrait relative flex h-24 w-20 shrink-0 items-end justify-center overflow-hidden border border-[#D4A843]/20 bg-[#060B13]"
          style={{
            transform: hovered ? "translateZ(32px) translateY(-4px)" : "translateZ(16px)",
            transition: "transform 360ms ease, filter 360ms ease",
            filter: hovered ? "drop-shadow(0 14px 18px rgba(0,0,0,.35))" : "none",
          }}
        >
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_22%,rgba(212,168,67,.16),transparent_34%)]" />
          <div className="absolute bottom-0 h-20 w-14 rounded-t-full bg-[#1B2432]" />
          <div className="absolute top-5 h-10 w-10 rounded-full bg-[#263142]" />
          <div className="absolute bottom-0 h-12 w-20 bg-[#111926]" />
          <div className="relative mb-4 text-body font-bold tracking-wider text-[#C8D0DC]/80">
            {initialsFor(suspect.name)}
          </div>
        </div>

        <div className="min-w-0 flex-1">
          <div className="mb-2 flex items-start justify-between gap-2">
            <div>
              <div
                className="suspect-typewriter max-w-full overflow-hidden whitespace-nowrap text-h2 font-semibold text-[#E2E6ED]"
                style={{ width: `${Math.max(12, suspect.name.length)}ch` }}
              >
                {suspect.name}
              </div>
              <div
                className="mt-1 text-detail uppercase tracking-[1.8px] text-[#6F7C8C] transition-all duration-300"
                style={{
                  opacity: hovered || expanded ? 1 : 0.55,
                  transform: hovered || expanded ? "translateX(0)" : "translateX(-8px)",
                }}
              >
                {suspect.occupation}
              </div>
            </div>
            <div className="rounded border border-[#D4A843]/25 bg-[#D4A843]/10 px-2 py-1 text-detail uppercase tracking-[1.4px] text-[#D4A843]">
              {tone}
            </div>
          </div>

          <div className="text-body italic leading-snug text-[#536173]">{suspect.relationship_to_victim}</div>

          <div className="mt-4">
            <div className="mb-1 flex items-center justify-between text-detail uppercase tracking-[1.6px] text-[#566373]">
              <span>Stress</span>
              <span>{Math.round(stress)}%</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-black/35">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{
                  width: `${stress}%`,
                  background: `linear-gradient(90deg, #4FA3FF, #D4A843 ${45 + stressRatio * 22}%, #EF4444)`,
                  boxShadow: `0 0 ${8 + stressRatio * 18}px rgba(212,168,67,${0.25 + stressRatio * 0.45})`,
                }}
              />
            </div>
          </div>
        </div>
      </div>

      <div
        className="relative z-10 mt-4 flex flex-wrap gap-1.5 transition-all duration-300"
        style={{ opacity: hovered || expanded ? 1 : 0, transform: hovered || expanded ? "translateY(0)" : "translateY(6px)" }}
      >
        <span className="border border-[#D4A843]/25 bg-[#D4A843]/10 px-2 py-1 text-detail uppercase tracking-[1.4px] text-[#D4A843]">
          {contradictions || 0} contradictions detected
        </span>
        <span className="border border-white/10 bg-white/[0.035] px-2 py-1 text-detail uppercase tracking-[1.4px] text-[#7D8998]">
          Last: {lastInterrogation}
        </span>
      </div>

      <div
        className="relative z-10 grid transition-all duration-300"
        style={{ gridTemplateRows: expanded ? "1fr" : "0fr" }}
      >
        <div className="overflow-hidden">
          <div className="mt-4 border-t border-white/10 pt-4">
            <div className="text-body leading-relaxed text-[#8793A3]">{suspect.personality}</div>
            <div className="mt-3 grid gap-2 text-detail leading-relaxed text-[#5F6D7E]">
              <div>
                <span className="uppercase tracking-[1.5px] text-[#D4A843]">Motive hint: </span>
                {suspect.private_wound || suspect.secret}
              </div>
              <div>
                <span className="uppercase tracking-[1.5px] text-[#D4A843]">Alibi: </span>
                {suspect.alibi}
              </div>
            </div>
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onInterrogate();
        }}
        className="relative z-10 mt-4 text-detail uppercase tracking-wider text-[#D4A843] transition-all duration-200 hover:text-[#F3D37A]"
        style={{
          opacity: hovered || expanded ? 1 : 0,
          transform: hovered || expanded ? "translateY(0)" : "translateY(5px)",
        }}
      >
        Interrogate →
      </button>
    </animated.div>
  );
}
