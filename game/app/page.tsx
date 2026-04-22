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
import EvidenceImageBootstrapper from "@/components/ui/EvidenceImageBootstrapper";

export default function Game() {
  const screen = useGameStore((s) => s.screen);

  return (
    <div className="h-dvh w-screen overflow-hidden" style={{ background: "#070E1A", color: "#C8D0DC" }}>
      <EvidenceImageBootstrapper />
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
      <AmbientSound />
    </div>
  );
}
