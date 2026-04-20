"use client";

// Jaw-bone driven animation — ported from character-preview/components/CharacterCanvas.tsx.
// Tripo V2 GLBs ship a biped skeleton only (no morph targets), so we drive
// the jaw or head bone directly. See character-preview for full architecture notes.

import { memo, useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";

const JAW_BONE_KEYWORDS = ["jaw", "chin", "mandible"] as const;
const HEAD_BONE_KEYWORDS = ["head", "neck_02", "neck2"] as const;
const JAW_OPEN_RADIANS = 0.55;
const HEAD_TURN_RADIANS = 0.04;

type JawDriver = {
  bone: THREE.Object3D;
  axis: "x" | "y";
  restAngle: number;
  openAngle: number;
  source: "jaw" | "head";
};

function matchesAny(name: string, keywords: readonly string[]): boolean {
  const lower = name.toLowerCase();
  return keywords.some((k) => lower.includes(k));
}

function findJawDriver(root: THREE.Object3D): JawDriver | null {
  // TypeScript doesn't track mutations through traverse callbacks, so we collect
  // candidates into an array and cast after the loop.
  const jawMatches: THREE.Object3D[] = [];
  const headMatches: THREE.Object3D[] = [];
  root.traverse((obj) => {
    if (matchesAny(obj.name, JAW_BONE_KEYWORDS)) jawMatches.push(obj);
    else if (matchesAny(obj.name, HEAD_BONE_KEYWORDS)) headMatches.push(obj);
  });
  const chosen = jawMatches[0] ?? headMatches[0] ?? null;
  if (!chosen) return null;
  const source: "jaw" | "head" = jawMatches.length > 0 ? "jaw" : "head";
  const axis: "x" | "y" = source === "jaw" ? "x" : "y";
  const restAngle = source === "jaw" ? chosen.rotation.x : chosen.rotation.y;
  const openAngle = restAngle + (source === "jaw" ? JAW_OPEN_RADIANS : HEAD_TURN_RADIANS);
  return { bone: chosen, axis, restAngle, openAngle, source };
}

interface Props {
  url: string;
  speakingRef: React.MutableRefObject<boolean>;
}

function CharacterModel({ url, speakingRef }: Props) {
  const { scene } = useGLTF(url);
  const sceneRef = useMemo(() => scene.clone(), [scene]);
  const driverRef = useRef<JawDriver | null>(null);
  const { camera } = useThree();

  useEffect(() => {
    // Do NOT set rotation on sceneRef — the GLB's root bone animation will
    // override any rotation applied to the scene object directly.
    // Facing direction is handled by the parent <group> wrapper below.
    sceneRef.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(sceneRef);
    if (!box.isEmpty()) {
      const center = box.getCenter(new THREE.Vector3());
      sceneRef.position.x -= center.x;
      sceneRef.position.z -= center.z;
      sceneRef.position.y -= box.min.y;
      box.setFromObject(sceneRef);
      const height = box.max.y - box.min.y;
      const torsoY = height * 0.62;
      const camZ = Math.max(2.5, height * 2.1);
      camera.position.set(0, torsoY + 0.1, camZ);
      (camera as THREE.PerspectiveCamera).lookAt(0, torsoY, 0);
    }

    sceneRef.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const mat of mats) {
        if (!mat) continue;
        const m = mat as THREE.MeshStandardMaterial;
        m.depthWrite = true;
        m.side = THREE.DoubleSide;
        m.needsUpdate = true;
      }
    });

    driverRef.current = findJawDriver(sceneRef);
  }, [sceneRef, camera]);

  useFrame(({ clock }) => {
    const driver = driverRef.current;
    if (!driver) return;
    let target = 0;
    if (speakingRef.current) {
      const t = clock.getElapsedTime();
      const osc = (Math.sin(t * 9.3) + Math.sin(t * 14.7)) * 0.5;
      target = THREE.MathUtils.clamp(osc * 0.65 + 0.25, 0, 1);
    }
    const desired = THREE.MathUtils.lerp(driver.restAngle, driver.openAngle, target);
    const current = driver.bone.rotation[driver.axis];
    driver.bone.rotation[driver.axis] = THREE.MathUtils.lerp(current, desired, 0.25);
  });

  // Parent group owns the facing rotation so animation clips can't override it.
  // If character faces backward, swap Math.PI / 2 → -Math.PI / 2.
  return (
    <group rotation={[0, Math.PI / 2, 0]}>
      <primitive object={sceneRef} />
    </group>
  );
}

export default memo(CharacterModel, (p, n) => p.url === n.url && p.speakingRef === n.speakingRef);
