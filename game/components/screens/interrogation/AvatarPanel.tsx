"use client";

import dynamic from "next/dynamic";
import { AnimatePresence, motion } from "framer-motion";
import type { SuspectDto } from "@/lib/backend-types";
import type {
  CharacterTimestampRange,
  VisemeTimeline,
} from "@/lib/character/character-pipeline";
import SuspectSelector from "@/components/screens/interrogation/SuspectSelector";
import StressVisualization from "@/components/screens/interrogation/StressVisualization";

const AvatarCanvas = dynamic(() => import("@/components/characters/AvatarCanvas"), { ssr: false });

export interface SpokenSubtitle {
  speaker: string;
  text: string;
  durationMs: number;
}

export interface AvatarPanelProps {
  suspect: SuspectDto;
  stress: number;
  speaking: boolean;
  stressed: boolean;
  characterTimestamps: CharacterTimestampRange[] | null;
  visemeTimeline: VisemeTimeline | null;
  speechElapsedMs: number;
  spokenSubtitle: SpokenSubtitle | null;
  revealedSubtitle: string;
  onFocusInput: () => void;
}

export default function AvatarPanel({
  suspect,
  stress,
  speaking,
  stressed,
  characterTimestamps,
  visemeTimeline,
  speechElapsedMs,
  spokenSubtitle,
  revealedSubtitle,
  onFocusInput,
}: AvatarPanelProps) {
  return (
    <div className="relative h-full w-[36%] flex-shrink-0 overflow-hidden border-r border-[#2a2a3a] bg-[#05070c] shadow-[inset_-30px_0_70px_rgba(0,0,0,0.58)]">
      <div className="pointer-events-none absolute inset-0 z-10 bg-[radial-gradient(ellipse_at_50%_0%,rgba(232,232,232,0.18),transparent_42%),radial-gradient(ellipse_at_50%_70%,transparent_35%,rgba(0,0,0,0.72)_100%)]" />
      <div className="pointer-events-none absolute left-1/2 top-0 z-10 h-[42%] w-[36%] -translate-x-1/2 bg-[#e8e8e8]/10 blur-3xl" />
      <StressVisualization stress={stress}>
        <AvatarCanvas
          speaking={speaking}
          stressed={stressed}
          stress={stress}
          modelPath={suspect.model_path}
          modelUrl={suspect.model_url}
          characterTimestamps={characterTimestamps}
          visemeTimeline={visemeTimeline}
          speechElapsedMs={speechElapsedMs}
        />
      </StressVisualization>
      <AnimatePresence>
        {spokenSubtitle ? (
          <motion.div
            className="pointer-events-none absolute bottom-[76px] left-4 right-4 z-20 border border-[#2a2a3a] bg-[#070911]/95 px-3 py-2 shadow-[0_18px_50px_rgba(0,0,0,.65)] backdrop-blur-sm"
            initial={{ opacity: 0, y: 8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: 0.22 }}
          >
            <div className="mb-1 flex items-center justify-between gap-2">
              <div className="font-mono text-detail uppercase tracking-[2.4px] text-[#b8860b]">{spokenSubtitle.speaker}</div>
              <div className="flex items-center gap-1.5 font-mono text-detail uppercase tracking-[1.6px] text-[#6F7E91]">
                <span className="h-1.5 w-1.5 rounded-full bg-[#8b0000] shadow-[0_0_10px_rgba(139,0,0,.75)]" />
                Live Statement
              </div>
            </div>
            <p className="min-h-[32px] text-body leading-relaxed text-[#e8e8e8]" style={{ fontFamily: "Georgia, serif" }}>
              {revealedSubtitle}
              {speaking ? <span className="ml-0.5 inline-block h-3 w-px animate-pulse align-middle bg-[#DDE4EE]" /> : null}
            </p>
          </motion.div>
        ) : null}
      </AnimatePresence>
      <div className="absolute bottom-5 left-1/2 z-20 -translate-x-1/2">
        <SuspectSelector suspect={suspect} isSelected stress={stress} onClick={onFocusInput} />
      </div>
    </div>
  );
}
