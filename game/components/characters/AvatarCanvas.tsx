"use client";

import { Suspense, useEffect, useRef } from "react";
import { Canvas } from "@react-three/fiber";
import { PerspectiveCamera } from "@react-three/drei";
import CharacterModel from "./CharacterModel";

const FALLBACK_MODELS = ["/models/fenn.glb", "/models/victoria.glb", "/models/oliver.glb"];

interface Props {
  speaking: boolean;
  modelPath?: string | null;
  modelUrl?: string | null;
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
      <ambientLight intensity={1.4} />
      <spotLight position={[0, 4, 2]} intensity={20} angle={0.5} penumbra={0.7} color="#fff8f0" />
      <pointLight position={[-2, 2, 2]} intensity={5} color="#c7d8ff" />
      <pointLight position={[0, 3, -3]} intensity={3} color="#D4A843" />
    </>
  );
}

export default function AvatarCanvas({ speaking, modelPath, modelUrl }: Props) {
  const speakingRef = useRef(speaking);
  useEffect(() => {
    speakingRef.current = speaking;
  }, [speaking]);

  const url = normalizeModelUrl(modelPath, modelUrl);

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
