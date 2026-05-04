"use client";

import { AnimatePresence } from "framer-motion";
import { useGameStore } from "@/lib/store";
import IntroScreen from "@/components/screens/IntroScreen";
import CinematicScreen from "@/components/screens/CinematicScreen";
import ManorScreen from "@/components/screens/ManorScreen";
import RoomScreen from "@/components/screens/RoomScreen";
import EvidenceScreen from "@/components/screens/EvidenceScreen";
import InterrogationRoom from "@/components/screens/InterrogationRoom";
import AccusationScreen from "@/components/screens/AccusationScreen";
import VerdictScreen from "@/components/screens/VerdictScreen";
import AmbientSound from "@/components/ui/AmbientSound";
import DetectiveNotebook from "@/components/ui/DetectiveNotebook";
import EvidenceImageBootstrapper from "@/components/ui/EvidenceImageBootstrapper";

export default function Game() {
  const screen = useGameStore((s) => s.screen);

  return (
    <div
      className="flex h-dvh w-screen flex-col overflow-hidden"
      style={{ background: "#070E1A", color: "#C8D0DC" }}
    >
      <EvidenceImageBootstrapper />
      <div className="relative min-h-0 flex-1 overflow-hidden">
        <AnimatePresence mode="wait">
          {screen === "intro" && <IntroScreen key="intro" />}
          {screen === "cinematic" && <CinematicScreen key="cinematic" />}
          {screen === "manor" && <ManorScreen key="manor" />}
          {screen === "room" && <RoomScreen key="room" />}
          {screen === "evidence" && <EvidenceScreen key="evidence" />}
          {screen === "interrogation" && <InterrogationRoom key="interrogation" />}
          {screen === "accusation" && <AccusationScreen key="accusation" />}
          {screen === "verdict" && <VerdictScreen key="verdict" />}
        </AnimatePresence>
      </div>
      <AmbientSound />
      <DetectiveNotebook />
    </div>
  );
}
