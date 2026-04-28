"use client";

import { Html, useGLTF } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { clone } from "three/examples/jsm/utils/SkeletonUtils.js";
import type {
  CharacterTimestampRange,
  VisemeTimeline,
} from "@/lib/character/character-pipeline";

const TARGET_HEIGHT = 2.02;
const GROUND_CLEARANCE = 0.04;
const FRONT_FACING_YAW = -Math.PI / 2;
const MOUTH_HINTS = ["viseme", "mouth", "lip", "jaw", "open", "aa", "ah", "ee", "oh", "oo"];
const BLINK_HINTS = ["blink", "eyelid", "lid", "close"];

type MorphTarget = {
  name: string;
  index: number;
};

type LipSyncTarget =
  | {
      mode: "morph";
      mesh: THREE.Mesh;
      morphTargets: MorphTarget[];
      blinkTargets: MorphTarget[];
      jawBone: THREE.Bone | null;
      headBone: THREE.Bone | null;
    }
  | {
      mode: "jaw";
      mesh: null;
      morphTargets: [];
      blinkTargets: MorphTarget[];
      jawBone: THREE.Bone;
      headBone: THREE.Bone | null;
    }
  | {
      mode: "head";
      mesh: null;
      morphTargets: [];
      blinkTargets: MorphTarget[];
      jawBone: null;
      headBone: THREE.Bone;
    }
  | {
      mode: "none";
      mesh: null;
      morphTargets: [];
      blinkTargets: MorphTarget[];
      jawBone: null;
      headBone: null;
    };

interface PreparedScene {
  scene: THREE.Group;
  scale: number;
  yOffset: number;
  centerX: number;
  centerZ: number;
  height: number;
  target: LipSyncTarget;
}

interface Props {
  url: string;
  speaking: boolean;
  stressed?: boolean;
  characterTimestamps?: CharacterTimestampRange[] | null;
  visemeTimeline?: VisemeTimeline | null;
  speechElapsedMs?: number;
}

function includesAny(name: string, hints: readonly string[]): boolean {
  const lower = name.toLowerCase();
  return hints.some((hint) => lower.includes(hint));
}

function getMorphTargets(dict: Record<string, number>, hints: readonly string[]): MorphTarget[] {
  return Object.entries(dict)
    .filter(([name]) => includesAny(name, hints))
    .map(([name, index]) => ({ name, index }));
}

function getBestMorphTarget(targets: MorphTarget[], cue: string): MorphTarget {
  const direct = targets.find((target) => target.name.toLowerCase().includes(cue.toLowerCase()));
  return direct ?? targets.find((target) => /open|jaw|mouth|aa|ah/i.test(target.name)) ?? targets[0];
}

function getActiveViseme(timeline: VisemeTimeline | null | undefined, elapsedMs: number): string {
  if (!timeline?.events.length) return "open";
  let active = timeline.events[0];
  for (const event of timeline.events) {
    if (event.timeMs <= elapsedMs) active = event;
    else break;
  }
  return active.viseme || "open";
}

function getMouthInfluence(
  timestamps: CharacterTimestampRange[] | null | undefined,
  timeline: VisemeTimeline | null | undefined,
  elapsedMs: number
): number {
  if (timeline?.events.length) {
    let active = timeline.events[0];
    for (const event of timeline.events) {
      if (event.timeMs <= elapsedMs) active = event;
      else break;
    }
    return THREE.MathUtils.clamp((active.strength || 0.8) * 0.85, 0.08, 1);
  }

  if (timestamps?.length) {
    return timestamps.some((range) => elapsedMs >= range.startMs && elapsedMs <= range.endMs) ? 0.75 : 0;
  }

  return 0.5 + Math.sin(elapsedMs / 85) * 0.35;
}

function resolveLipSyncTarget(root: THREE.Object3D): LipSyncTarget {
  const morphCandidates: Array<LipSyncTarget & { mode: "morph" }> = [];
  const blinkTargets: MorphTarget[] = [];
  let jawBone: THREE.Bone | null = null;
  let headBone: THREE.Bone | null = null;
  const rigMeshes: Array<{ mesh: string; morphs: string[] }> = [];
  const rigBones: string[] = [];

  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    const bone = object as THREE.Bone;

    if ("isMesh" in object && object.isMesh) {
      mesh.frustumCulled = false;
      const morphKeys = mesh.morphTargetDictionary ? Object.keys(mesh.morphTargetDictionary) : [];
      rigMeshes.push({ mesh: mesh.name || "unnamed-mesh", morphs: morphKeys });

      if (mesh.morphTargetDictionary && Array.isArray(mesh.morphTargetInfluences)) {
        const mouth = getMorphTargets(mesh.morphTargetDictionary, MOUTH_HINTS);
        const blinks = getMorphTargets(mesh.morphTargetDictionary, BLINK_HINTS);
        if (blinkTargets.length === 0) blinkTargets.push(...blinks);
        if (mouth.length > 0) {
          morphCandidates.push({
            mode: "morph",
            mesh,
            morphTargets: mouth,
            blinkTargets: blinks,
            jawBone: null,
            headBone: null,
          });
        }
      }
    }

    if (bone.isBone) {
      const lower = bone.name.toLowerCase();
      if (/(head|neck|jaw|mandible|spine|hips|pelvis|root)/.test(lower)) {
        rigBones.push(bone.name);
      }
      if (!jawBone && /(jaw|mandible)/i.test(bone.name)) jawBone = bone;
      if (!headBone && /(head|neck)/i.test(bone.name)) headBone = bone;
    }
  });

  console.debug("[character-rig] rig-structure", { rigMeshes, rigBones });

  const morph = morphCandidates.sort((a, b) => b.morphTargets.length - a.morphTargets.length)[0];
  const target: LipSyncTarget = morph
    ? { ...morph, blinkTargets: morph.blinkTargets.length ? morph.blinkTargets : blinkTargets, jawBone, headBone }
    : jawBone
      ? { mode: "jaw", mesh: null, morphTargets: [], blinkTargets, jawBone, headBone }
      : headBone
        ? { mode: "head", mesh: null, morphTargets: [], blinkTargets, jawBone: null, headBone }
        : { mode: "none", mesh: null, morphTargets: [], blinkTargets, jawBone: null, headBone: null };

  console.debug("[character-rig] selected-lip-sync-target", {
    mode: target.mode,
    morphTargetNames: target.morphTargets.map((item) => item.name),
    blinkTargetNames: target.blinkTargets.map((item) => item.name),
    jawBone: target.jawBone?.name ?? null,
    headBone: target.headBone?.name ?? null,
  });

  if (target.mode === "none") {
    console.warn("[character-rig] No facial morph targets or jaw/head bones found. Body animation disabled.");
  }

  return target;
}

function prepareScene(baseScene: THREE.Object3D): PreparedScene {
  const scene = clone(baseScene) as THREE.Group;
  scene.updateWorldMatrix(true, true);

  const box = new THREE.Box3().setFromObject(scene);
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();

  let scale = 1;
  let yOffset = GROUND_CLEARANCE;
  let centerX = 0;
  let centerZ = 0;
  let height = TARGET_HEIGHT;

  if (!box.isEmpty()) {
    box.getSize(size);
    box.getCenter(center);
    if (Number.isFinite(size.y) && size.y > 0) {
      scale = TARGET_HEIGHT / size.y;
      height = TARGET_HEIGHT;
    }
    centerX = -center.x * scale;
    centerZ = -center.z * scale;
    yOffset = -box.min.y * scale + GROUND_CLEARANCE;
  }

  scene.scale.setScalar(THREE.MathUtils.clamp(scale, 0.01, 10));
  scene.position.set(centerX, 0, centerZ);
  scene.rotation.set(0, FRONT_FACING_YAW, 0);

  scene.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!("isMesh" in object) || !object.isMesh) return;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of materials) {
      if (!material) continue;
      const standard = material as THREE.MeshStandardMaterial;
      standard.depthWrite = true;
      standard.side = THREE.DoubleSide;
      standard.needsUpdate = true;
    }
  });

  return { scene, scale, yOffset, centerX, centerZ, height, target: resolveLipSyncTarget(scene) };
}

function CharacterModel({
  url,
  speaking,
  stressed = false,
  characterTimestamps,
  visemeTimeline,
  speechElapsedMs = 0,
}: Props) {
  const { scene, animations } = useGLTF(url);
  const { camera } = useThree();
  const groupRef = useRef<THREE.Group>(null);
  const mixerRef = useRef<THREE.AnimationMixer | null>(null);
  const jawRestX = useRef(0);
  const headRestX = useRef(0);
  const headRestY = useRef(0);
  const [lipSyncMode, setLipSyncMode] = useState<LipSyncTarget["mode"]>("none");
  const prepared = useMemo(() => prepareScene(scene), [scene]);

  useEffect(() => {
    const group = groupRef.current;
    if (!group) return;

    group.position.set(0, prepared.yOffset, 0);
    group.rotation.set(0, 0, 0);

    if (prepared.target.jawBone) jawRestX.current = prepared.target.jawBone.rotation.x;
    if (prepared.target.headBone) {
      headRestX.current = prepared.target.headBone.rotation.x;
      headRestY.current = prepared.target.headBone.rotation.y;
    }
    setLipSyncMode(prepared.target.mode);

    const perspective = camera as THREE.PerspectiveCamera;
    perspective.position.set(0, prepared.height * 0.72, prepared.height * 1.65);
    perspective.lookAt(0, prepared.height * 0.62, 0);
    perspective.updateProjectionMatrix();

    const clip =
      animations.find((item) => item.name.toLowerCase().includes("idle")) ?? animations[0];
    if (clip) {
      const stableClip = new THREE.AnimationClip(
        `${clip.name}_faceSafe`,
        clip.duration,
        clip.tracks.filter((track) => {
          const name = track.name.toLowerCase();
          return !name.endsWith(".position") && !/(hips|spine|pelvis|root|armature)/.test(name);
        })
      );
      const mixer = new THREE.AnimationMixer(prepared.scene);
      mixerRef.current = mixer;
      mixer.clipAction(stableClip).play();
    }

    return () => {
      mixerRef.current?.stopAllAction();
      mixerRef.current = null;
    };
  }, [animations, camera, prepared]);

  useFrame(({ clock }, delta) => {
    mixerRef.current?.update(delta);
    const group = groupRef.current;
    if (!group) return;

    group.position.set(0, prepared.yOffset, 0);
    group.rotation.set(0, 0, 0);
    prepared.scene.position.set(prepared.centerX, 0, prepared.centerZ);
    prepared.scene.rotation.set(0, FRONT_FACING_YAW, 0);

    const t = clock.getElapsedTime();
    const mouthTarget = speaking
      ? getMouthInfluence(characterTimestamps, visemeTimeline, speechElapsedMs)
      : 0;
    const target = prepared.target;

    if (target.mode === "morph" && Array.isArray(target.mesh.morphTargetInfluences)) {
      const active = getBestMorphTarget(target.morphTargets, getActiveViseme(visemeTimeline, speechElapsedMs));
      for (const morph of target.morphTargets) {
        const current = target.mesh.morphTargetInfluences[morph.index] ?? 0;
        const next = speaking && morph.index === active.index ? mouthTarget : 0;
        target.mesh.morphTargetInfluences[morph.index] = THREE.MathUtils.lerp(current, next, 0.3);
      }
      const blink = speaking && t % 4.6 < 0.12 ? Math.sin(((t % 4.6) / 0.12) * Math.PI) : 0;
      for (const morph of target.blinkTargets) {
        const current = target.mesh.morphTargetInfluences[morph.index] ?? 0;
        target.mesh.morphTargetInfluences[morph.index] = THREE.MathUtils.lerp(current, blink, 0.32);
      }
    } else if (target.mode === "jaw") {
      target.jawBone.rotation.x = THREE.MathUtils.lerp(
        target.jawBone.rotation.x,
        THREE.MathUtils.clamp(jawRestX.current + mouthTarget * 0.18, jawRestX.current, jawRestX.current + 0.18),
        0.28
      );
    }

    if (speaking && target.headBone) {
      target.headBone.rotation.x = THREE.MathUtils.lerp(
        target.headBone.rotation.x,
        THREE.MathUtils.clamp(headRestX.current + Math.sin(t * 10) * 0.02 * Math.max(0.3, mouthTarget), headRestX.current - 0.02, headRestX.current + 0.04),
        0.24
      );
      target.headBone.rotation.y = THREE.MathUtils.lerp(
        target.headBone.rotation.y,
        THREE.MathUtils.clamp(headRestY.current + Math.sin(t * 5.2) * 0.012, headRestY.current - 0.015, headRestY.current + 0.015),
        0.2
      );
    } else if (target.headBone) {
      target.headBone.rotation.x = THREE.MathUtils.lerp(target.headBone.rotation.x, headRestX.current, 0.16);
      target.headBone.rotation.y = THREE.MathUtils.lerp(target.headBone.rotation.y, headRestY.current, 0.16);
    }

    if (stressed && !speaking && target.headBone) {
      target.headBone.rotation.y = THREE.MathUtils.lerp(
        target.headBone.rotation.y,
        headRestY.current + Math.sin(t * 1.4) * 0.01,
        0.04
      );
    }
  });

  return (
    <group ref={groupRef}>
      <primitive object={prepared.scene} />
      {speaking && lipSyncMode === "none" ? (
        <Html position={[0, prepared.height + 0.12, 0]} center>
          <div className="flex items-center gap-1 rounded-full border border-[#D4A843]/35 bg-[#070E1A]/80 px-2 py-1 text-[9px] uppercase tracking-[0.14em] text-[#D4A843] shadow-[0_0_14px_rgba(212,168,67,.15)]">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#D4A843]" />
            Speaking
          </div>
        </Html>
      ) : null}
    </group>
  );
}

export default memo(CharacterModel);
