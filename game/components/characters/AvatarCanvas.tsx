"use client";

import { Suspense, useEffect, useRef } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, PerspectiveCamera } from "@react-three/drei";
import CharacterModel from "./CharacterModel";
import type {
  CharacterTimestampRange,
  VisemeTimeline,
} from "@/lib/character/character-pipeline";

const FALLBACK_MODELS = ["/models/fenn.glb", "/models/victoria.glb", "/models/oliver.glb"];

interface Props {
  speaking: boolean;
  stressed?: boolean;
  modelPath?: string | null;
  modelUrl?: string | null;
  characterTimestamps?: CharacterTimestampRange[] | null;
  visemeTimeline?: VisemeTimeline | null;
  speechElapsedMs?: number;
}

function normalizeModelUrl(modelPath?: string | null, modelUrl?: string | null): string {
  const candidate = (modelUrl ?? modelPath ?? "").trim();
  if (!candidate) {
    return FALLBACK_MODELS[0];
  }

  if (candidate.startsWith("http://") || candidate.startsWith("https://")) {
    return candidate;
  }

  if (candidate.startsWith("/")) {
    return candidate;
  }

  return `/${candidate}`;
}

function Lights() {
  return (
    <>
      <ambientLight intensity={0.08} color="#9fb0c8" />
      <directionalLight position={[0.55, 1.95, 1.35]} intensity={1.55} color="#f2ece2" />
      <pointLight position={[0, 1.38, 1.02]} intensity={1.2} color="#f5efe4" />
      <spotLight
        position={[0.1, 2.0, 1.55]}
        angle={0.34}
        penumbra={0.95}
        intensity={2.4}
        color="#fff7ec"
        distance={5}
        decay={1.4}
      />
    </>
  );
}

export default function AvatarCanvas({
  speaking,
  stressed = false,
  modelPath,
  modelUrl,
  characterTimestamps,
  visemeTimeline,
  speechElapsedMs = 0,
}: Props) {
  const speakingRef = useRef(speaking);
  useEffect(() => {
    speakingRef.current = speaking;
  }, [speaking]);

  const url = normalizeModelUrl(modelPath, modelUrl);

  return (
    <Canvas
      frameloop="always"
      gl={{ antialias: true, alpha: false, powerPreference: "high-performance" }}
      onCreated={({ gl }) => gl.setClearColor("#000000", 1)}
      style={{ width: "100%", height: "100%", background: "#000000" }}
    >
      <PerspectiveCamera makeDefault fov={35} position={[0, 1.08, 3.65]} />
      <color attach="background" args={["#000000"]} />
      <Lights />
      <Suspense fallback={null}>
        <CharacterModel
          url={url}
          speaking={speaking}
          stressed={stressed}
          characterTimestamps={characterTimestamps}
          visemeTimeline={visemeTimeline}
          speechElapsedMs={speechElapsedMs}
        />
      </Suspense>
      <OrbitControls
        enablePan
        enableRotate
        enableZoom
        target={[0, 1.05, 0]}
        minDistance={1.25}
        maxDistance={4.3}
        minPolarAngle={0.35}
        maxPolarAngle={Math.PI / 2 + 0.25}
        enableDamping
        dampingFactor={0.08}
        rotateSpeed={0.72}
        zoomSpeed={0.55}
        panSpeed={0.45}
      />
    </Canvas>
  );
}
