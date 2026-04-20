"use client";

import { Suspense, useEffect, useRef } from "react";
import { Canvas } from "@react-three/fiber";
import { PerspectiveCamera } from "@react-three/drei";
import CharacterModel from "./CharacterModel";
import type { SuspectId } from "@/lib/cases/harlow-manor";

const MODEL_PATHS: Record<SuspectId, string> = {
  fenn:     "/models/fenn.glb",
  victoria: "/models/victoria.glb",
  oliver:   "/models/oliver.glb",
};

interface Props {
  suspectId: SuspectId;
  speaking: boolean;
}

function Lights() {
  return (
    <>
      <ambientLight intensity={1.4} />
      <spotLight
        position={[0, 4, 2]}
        intensity={20}
        angle={0.5}
        penumbra={0.7}
        color="#fff8f0"
      />
      <pointLight position={[-2, 2, 2]} intensity={5} color="#c7d8ff" />
      {/* Warm rim from behind to separate subject from background */}
      <pointLight position={[0, 3, -3]} intensity={3} color="#D4A843" />
    </>
  );
}

export default function AvatarCanvas({ suspectId, speaking }: Props) {
  const speakingRef = useRef(speaking);
  useEffect(() => { speakingRef.current = speaking; }, [speaking]);

  const url = MODEL_PATHS[suspectId];

  return (
    <Canvas
      frameloop="always"
      gl={{ antialias: true, alpha: false, powerPreference: "high-performance" }}
      onCreated={({ gl }) => gl.setClearColor("#070E1A", 1)}
      style={{ width: "100%", height: "100%", background: "#070E1A" }}
    >
      <PerspectiveCamera makeDefault fov={45} position={[0, 1.5, 4]} />
      <Lights />
      <Suspense fallback={null}>
        <CharacterModel url={url} speakingRef={speakingRef} />
      </Suspense>
    </Canvas>
  );
}
