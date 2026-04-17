"use client";

import { memo, Suspense, useEffect, useMemo, useRef, type MutableRefObject } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import {
  Html,
  OrbitControls,
  PerspectiveCamera,
  useGLTF,
} from "@react-three/drei";
import * as THREE from "three";
import type {
  CharacterTimestampRange,
  VisemeTimeline,
} from "@/lib/character-pipeline";

interface CharacterCanvasProps {
  modelPath?: string;
  speaking: boolean;
  stressed: boolean;
  visemeTimeline?: VisemeTimeline | null;
  characterTimestamps?: CharacterTimestampRange[] | null;
  speechElapsedMs?: number;
}

type DebugMode = "mesh-only" | "model-static" | "model-animated";

const DEBUG_MODE: DebugMode = "model-animated";
const TARGET_HEIGHT = 2.2;
const DEFAULT_TARGET = [0, 1, 0] as const;

function LoadingFallback() {
  return (
    <group>
      <mesh>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#d4a843" />
      </mesh>
      <Html center>
        <div
          style={{
            marginTop: 80,
            color: "#ffffff",
            fontSize: 12,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            pointerEvents: "none",
            userSelect: "none",
            textShadow: "0 1px 2px rgba(0,0,0,0.7)",
          }}
        >
          Loading model...
        </div>
      </Html>
    </group>
  );
}

function PathFallbackSphere() {
  return (
    <mesh position={[0, 1, 0]}>
      <sphereGeometry args={[0.8, 32, 32]} />
      <meshStandardMaterial color="#ff5f5f" />
    </mesh>
  );
}

function DebugMesh() {
  return (
    <group position={[0, 1, 0]}>
      <mesh>
        <boxGeometry args={[1.4, 1.8, 0.8]} />
        <meshStandardMaterial color="#d4a843" metalness={0.15} roughness={0.65} />
      </mesh>
      <mesh position={[0, -0.95, 0]}>
        <circleGeometry args={[0.9, 48]} />
        <meshStandardMaterial color="#1e2531" />
      </mesh>
    </group>
  );
}

function getModelYaw(url: string): number {
  const lower = url.toLowerCase();
  if (lower.includes("soldier")) return Math.PI;
  return 0;
}

const MOUTH_MORPH_HINTS = [
  "viseme",
  "mouth",
  "lip",
  "jaw",
  "open",
  "mouthopen",
  "mouth_open",
  "jawopen",
  "jaw_open",
  "aa",
  "oh",
  "ou",
];

function pickMouthMorphIndices(dict: Record<string, number>): number[] {
  const entries = Object.entries(dict);
  const matches = entries
    .filter(([name]) =>
      MOUTH_MORPH_HINTS.some((hint) => name.toLowerCase().includes(hint))
    )
    .map(([, idx]) => idx);
  const uniqueMatches = Array.from(new Set(matches));
  if (uniqueMatches.length > 0) return uniqueMatches.slice(0, 4);

  // Some generated rigs expose unnamed/obscure morph channels.
  // Fallback to first channels so speaking still has visible motion.
  return entries.map(([, idx]) => idx).slice(0, 2);
}

function getTimestampMouthInfluence(
  characterTimestamps: CharacterTimestampRange[] | null | undefined,
  elapsedMs: number
): number | null {
  if (!characterTimestamps?.length) return null;
  for (const range of characterTimestamps) {
    if (elapsedMs >= range.startMs && elapsedMs <= range.endMs) {
      return 1;
    }
  }
  return 0;
}

function getVisemeMouthInfluence(
  timeline: VisemeTimeline | null | undefined,
  elapsedMs: number
): number | null {
  if (!timeline || !timeline.events.length) return null;
  const events = timeline.events;
  let active = events[0];
  for (let i = 0; i < events.length; i += 1) {
    if (events[i].timeMs <= elapsedMs) active = events[i];
    else break;
  }
  return THREE.MathUtils.clamp((active.strength || 0.9) * 0.9, 0.05, 1);
}

function GLBCharacter({
  url,
  animated,
  speakingRef,
  stressedRef,
  targetMouthInfluenceRef,
}: {
  url: string;
  animated: boolean;
  speakingRef: MutableRefObject<boolean>;
  stressedRef: MutableRefObject<boolean>;
  targetMouthInfluenceRef: MutableRefObject<number>;
}) {
  const { scene, animations } = useGLTF(url);
  const mixerRef = useRef<THREE.AnimationMixer | undefined>(undefined);
  const groupRef = useRef<THREE.Group>(null);
  const hipsBoneRef = useRef<THREE.Bone | null>(null);
  const hipsInitialXRef = useRef(0);
  const hipsInitialZRef = useRef(0);
  const jawBoneRef = useRef<THREE.Bone | null>(null);
  const jawInitialXRef = useRef(0);
  const headBoneRef = useRef<THREE.Bone | null>(null);
  const headInitialXRef = useRef(0);
  const headInitialYRef = useRef(0);
  const mouthMorphTargetsRef = useRef<
    Array<{ mesh: THREE.Mesh; indices: number[] }>
  >([]);
  const hasLipRigRef = useRef(false);
  const hasLoggedMouthRigRef = useRef(false);
  const hasLoggedSpeechApplyRef = useRef(false);
  const hasLoggedSilentSpeechRef = useRef(false);
  const hasLoggedRigidSpeechApplyRef = useRef(false);
  const clockRef = useRef(0);
  const finalScaleRef = useRef(1);
  const finalYOffsetRef = useRef(0);
  const centerOffsetXRef = useRef(0);
  const centerOffsetZRef = useRef(0);
  const yawRef = useRef(0);
  const setupDoneRef = useRef(false);
  const setupKeyRef = useRef<string>("");
  const stableClipRef = useRef<THREE.AnimationClip | null>(null);
  const rigidMeshSpeechFallbackRef = useRef<Array<{
    mesh: THREE.Mesh;
    baseScaleX: number;
    baseScaleY: number;
    baseScaleZ: number;
  }>>([]);

  const sceneObject = useMemo(() => scene, [scene]);

  useEffect(() => {
    if (!scene) return;
    console.log("--- DEEP RIG ANALYSIS FOR DR. FENN ---");
    scene.traverse((node) => {
      const mesh = node as THREE.Mesh;
      if (mesh.isMesh && mesh.morphTargetDictionary) {
        console.log(`Mesh Found: ${mesh.name || "(unnamed)"}`);
        console.log("Mouth/Face Morphs:", Object.keys(mesh.morphTargetDictionary));
      }
    });

    console.log("--- ALL NODES IN DR. FENN ---");
    const nuclear: Array<{
      name: string;
      type: string;
      hasMorphs: boolean;
      morphKeys: string[];
      geometryMorphAttribCount: number;
      isSkinnedMesh: boolean;
    }> = [];
    scene.traverse((node) => {
      const mesh = node as THREE.Mesh;
      const skinned = node as THREE.SkinnedMesh;
      if (mesh.isMesh || skinned.isSkinnedMesh) {
        const dict = mesh.morphTargetDictionary;
        const geo = mesh.geometry as THREE.BufferGeometry | undefined;
        const morphAttribCount = geo?.morphAttributes
          ? Object.keys(geo.morphAttributes).length
          : 0;
        const entry = {
          name: mesh.name || "(unnamed)",
          type: mesh.type,
          hasMorphs: Boolean(dict),
          morphKeys: dict ? Object.keys(dict) : [],
          geometryMorphAttribCount: morphAttribCount,
          isSkinnedMesh: Boolean(skinned.isSkinnedMesh),
        };
        nuclear.push(entry);
        console.log(
          `Node: ${entry.name} | type=${entry.type} | skinned=${entry.isSkinnedMesh} | morphs=${entry.hasMorphs ? "YES" : "NO"} | geoMorphAttribs=${entry.geometryMorphAttribCount}`
        );
        if (entry.hasMorphs) {
          console.log("  Keys:", entry.morphKeys);
        }
      }
    });
    // #region agent log
    fetch("http://127.0.0.1:7646/ingest/6ad1a864-56ce-462c-9062-248741f1b63d", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Debug-Session-Id": "579b81",
      },
      body: JSON.stringify({
        sessionId: "579b81",
        runId: "nuclear",
        hypothesisId: "N1",
        location: "components/CharacterCanvas.tsx:nuclearDump",
        message: "Full mesh/skinned mesh dump",
        data: {
          nodeCount: nuclear.length,
          nodes: nuclear,
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
  }, [scene]);

  useEffect(() => {
    const group = groupRef.current;
    if (!group) return;
    const setupKey = `${url}:${animated}`;
    if (setupKeyRef.current === setupKey) return;
    setupKeyRef.current = setupKey;

    console.log("Model Loaded:", url);

    hipsBoneRef.current = null;
    jawBoneRef.current = null;
    headBoneRef.current = null;
    mouthMorphTargetsRef.current = [];
    rigidMeshSpeechFallbackRef.current = [];
    hasLipRigRef.current = false;
    hasLoggedMouthRigRef.current = false;
    scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.frustumCulled = false;
        mesh.visible = true;

        if (mesh.morphTargetDictionary && mesh.morphTargetInfluences) {
          const mouthIndices = pickMouthMorphIndices(mesh.morphTargetDictionary);
          // #region agent log
          fetch("http://127.0.0.1:7646/ingest/6ad1a864-56ce-462c-9062-248741f1b63d", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Debug-Session-Id": "579b81",
            },
            body: JSON.stringify({
              sessionId: "579b81",
              runId: "pre-fix",
              hypothesisId: "H2",
              location: "components/CharacterCanvas.tsx:meshTraverse",
              message: "Morph dictionary discovered on mesh",
              data: {
                modelUrl: url,
                meshName: mesh.name || "(unnamed)",
                morphKeys: Object.keys(mesh.morphTargetDictionary),
                pickedMouthIndices: mouthIndices,
                morphInfluenceCount: mesh.morphTargetInfluences.length,
              },
              timestamp: Date.now(),
            }),
          }).catch(() => {});
          // #endregion
          if (mouthIndices.length > 0) {
            mouthMorphTargetsRef.current.push({ mesh, indices: mouthIndices });
          }
        }
      }

      if (!hipsBoneRef.current) {
        const bone = obj as THREE.Bone;
        if (bone.isBone && /hips/i.test(bone.name)) {
          hipsBoneRef.current = bone;
          hipsInitialXRef.current = bone.position.x;
          hipsInitialZRef.current = bone.position.z;
          console.log("Hips Bone Locked:", bone.name);
        }
      }

      if (!headBoneRef.current) {
        const bone = obj as THREE.Bone;
        if (bone.isBone && /head/i.test(bone.name)) {
          headBoneRef.current = bone;
          headInitialXRef.current = bone.rotation.x;
          headInitialYRef.current = bone.rotation.y;
        }
      }

      if (!jawBoneRef.current) {
        const bone = obj as THREE.Bone;
        if (bone.isBone && /(jaw|mandible)/i.test(bone.name)) {
          jawBoneRef.current = bone;
          jawInitialXRef.current = bone.rotation.x;
          console.log("Jaw Bone Locked:", bone.name);
        }
      }
    });

    const meshCount = scene
      .children.reduce((count, child) => count + (child ? 1 : 0), 0);
    let totalMeshCount = 0;
    let skinnedMeshCount = 0;
    let boneCount = 0;
    scene.traverse((obj) => {
      const asMesh = obj as THREE.Mesh;
      const asBone = obj as THREE.Bone;
      if (asMesh.isMesh) totalMeshCount += 1;
      if ((obj as THREE.SkinnedMesh).isSkinnedMesh) skinnedMeshCount += 1;
      if (asBone.isBone) boneCount += 1;
    });
    // #region agent log
    fetch("http://127.0.0.1:7646/ingest/6ad1a864-56ce-462c-9062-248741f1b63d", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Debug-Session-Id": "579b81",
      },
      body: JSON.stringify({
        sessionId: "579b81",
        runId: "pre-fix",
        hypothesisId: "H6",
        location: "components/CharacterCanvas.tsx:modelStructure",
        message: "Loaded model structure summary",
        data: {
          modelUrl: url,
          rootChildCount: meshCount,
          totalMeshCount,
          skinnedMeshCount,
          boneCount,
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion

    hasLipRigRef.current = mouthMorphTargetsRef.current.length > 0 || Boolean(jawBoneRef.current);
    if (!hasLipRigRef.current && !headBoneRef.current) {
      scene.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (!mesh.isMesh) return;
        rigidMeshSpeechFallbackRef.current.push({
          mesh,
          baseScaleX: mesh.scale.x,
          baseScaleY: mesh.scale.y,
          baseScaleZ: mesh.scale.z,
        });
      });
      // #region agent log
      fetch("http://127.0.0.1:7646/ingest/6ad1a864-56ce-462c-9062-248741f1b63d", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Debug-Session-Id": "579b81",
        },
        body: JSON.stringify({
          sessionId: "579b81",
          runId: "post-fix",
          hypothesisId: "F1",
          location: "components/CharacterCanvas.tsx:rigidFallbackSetup",
          message: "Configured rigid mesh speech fallback",
          data: {
            modelUrl: url,
            fallbackMeshCount: rigidMeshSpeechFallbackRef.current.length,
          },
          timestamp: Date.now(),
        }),
      }).catch(() => {});
      // #endregion
    }

    if (!hasLoggedMouthRigRef.current) {
      if (mouthMorphTargetsRef.current.length > 0) {
        console.log(
          "Mouth Morph Targets Found:",
          mouthMorphTargetsRef.current.map((item) => item.indices.length)
        );
      } else if (jawBoneRef.current) {
        console.log("Lip Sync Fallback:", "jaw bone");
      } else {
        console.log("Lip Sync Fallback:", "head bob only (no morph/jaw rig)");
      }
      // #region agent log
      fetch("http://127.0.0.1:7646/ingest/6ad1a864-56ce-462c-9062-248741f1b63d", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Debug-Session-Id": "579b81",
        },
        body: JSON.stringify({
          sessionId: "579b81",
          runId: "pre-fix",
          hypothesisId: "H3",
          location: "components/CharacterCanvas.tsx:rigSummary",
          message: "Resolved mouth rig strategy",
          data: {
            modelUrl: url,
            morphMeshCount: mouthMorphTargetsRef.current.length,
            hasJawBone: Boolean(jawBoneRef.current),
            jawBoneName: jawBoneRef.current?.name ?? null,
            hasHeadBone: Boolean(headBoneRef.current),
          },
          timestamp: Date.now(),
        }),
      }).catch(() => {});
      // #endregion
      hasLoggedMouthRigRef.current = true;
    }

    scene.updateWorldMatrix(true, true);

    const box = new THREE.Box3();
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    let hasGeometry = false;

    scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh || !mesh.geometry) return;

      mesh.geometry.computeBoundingBox();
      if (!mesh.geometry.boundingBox) return;

      const worldBox = mesh.geometry.boundingBox.clone();
      worldBox.applyMatrix4(mesh.matrixWorld);
      box.union(worldBox);
      hasGeometry = true;
    });

    let nextScale = 1;
    let nextY = 0;
    let nextCenterX = 0;
    let nextCenterZ = 0;

    if (hasGeometry) {
      box.getSize(size);
      console.log("Bounding Box Size:", size.toArray());

      if (Number.isFinite(size.y) && size.y > 0) {
        nextScale = TARGET_HEIGHT / size.y;
      }

      if (!Number.isFinite(nextScale) || nextScale <= 0) {
        nextScale = 1;
      }

      nextScale = THREE.MathUtils.clamp(nextScale, 0.01, 10);

      if (Number.isFinite(box.min.y)) {
        nextY = -box.min.y * nextScale;
      }

      box.getCenter(center);
      if (Number.isFinite(center.x)) {
        nextCenterX = -center.x * nextScale;
      }
      if (Number.isFinite(center.z)) {
        nextCenterZ = -center.z * nextScale;
      }
    } else {
      console.log("Bounding Box Size: no mesh geometry found");
    }

    if (!Number.isFinite(nextY)) {
      nextY = 0;
    }
    nextY = THREE.MathUtils.clamp(nextY, -5, 5);

    finalScaleRef.current = nextScale;
    finalYOffsetRef.current = nextY;
    centerOffsetXRef.current = THREE.MathUtils.clamp(nextCenterX, -5, 5);
    centerOffsetZRef.current = THREE.MathUtils.clamp(nextCenterZ, -5, 5);
    yawRef.current = url.toLowerCase().includes("soldier") ? Math.PI : 0;
    yawRef.current = getModelYaw(url);

    scene.scale.setScalar(finalScaleRef.current);
    scene.position.set(centerOffsetXRef.current, 0, centerOffsetZRef.current);
    scene.rotation.set(0, yawRef.current, 0);
    group.position.set(0, finalYOffsetRef.current, 0);

    console.log("Applied Scale:", finalScaleRef.current, "Y Offset:", finalYOffsetRef.current);

    if (animated) {
      const mixer = new THREE.AnimationMixer(scene);
      mixerRef.current = mixer;

      const clip =
        animations.find((c) => c.name === "Idle") ||
        animations.find((c) => c.name.toLowerCase().includes("idle")) ||
        animations[0];

      if (clip) {
        const stableClip = new THREE.AnimationClip(
          `${clip.name}_noRootMotion`,
          clip.duration,
          clip.tracks.filter((track) => {
            const name = track.name.toLowerCase();
            const isPositionTrack = name.endsWith(".position");
            const isRootMotionTrack =
              /hips|root|armature|mixamorig/.test(name) && isPositionTrack;
            return !isRootMotionTrack;
          })
        );
        stableClipRef.current = stableClip;
        const removedTracks = clip.tracks.length - stableClip.tracks.length;
        if (removedTracks > 0) {
          console.log("Root Motion Tracks Removed:", removedTracks);
        }

        const action = mixer.clipAction(stableClip);
        action.setLoop(THREE.LoopRepeat, Infinity);
        action.play();
      }
    }

    setupDoneRef.current = true;

    return () => {
      mixerRef.current?.stopAllAction();
      mixerRef.current = undefined;
      stableClipRef.current = null;
      setupDoneRef.current = false;
      setupKeyRef.current = "";
    };
  }, [scene, sceneObject, animations, url, animated]);

  useFrame((_, delta) => {
    mixerRef.current?.update(delta);

    if (!groupRef.current || !setupDoneRef.current) return;

    // Keep the skinned root stable even if imported clips contain root motion.
    if (hipsBoneRef.current) {
      hipsBoneRef.current.position.x = hipsInitialXRef.current;
      hipsBoneRef.current.position.z = hipsInitialZRef.current;
    }

    scene.position.set(centerOffsetXRef.current, 0, centerOffsetZRef.current);
    scene.rotation.set(0, yawRef.current, 0);

    clockRef.current = (clockRef.current + delta) % 6283;
    const t = clockRef.current;
    const baseY = finalYOffsetRef.current;

    if (!animated) {
      groupRef.current.position.y = baseY;
      groupRef.current.rotation.x = 0;
      groupRef.current.rotation.y = 0;
      return;
    }

    const mouthTarget = speakingRef.current
      ? THREE.MathUtils.clamp(targetMouthInfluenceRef.current, 0, 1)
      : 0;
    if (!speakingRef.current) {
      hasLoggedSpeechApplyRef.current = false;
      hasLoggedSilentSpeechRef.current = false;
      hasLoggedRigidSpeechApplyRef.current = false;
    }
    if (
      speakingRef.current &&
      mouthTarget > 0 &&
      !hasLoggedSpeechApplyRef.current
    ) {
      // #region agent log
      fetch("http://127.0.0.1:7646/ingest/6ad1a864-56ce-462c-9062-248741f1b63d", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Debug-Session-Id": "579b81",
        },
        body: JSON.stringify({
          sessionId: "579b81",
          runId: "pre-fix",
          hypothesisId: "H4",
          location: "components/CharacterCanvas.tsx:useFrameSpeakingPositive",
          message: "Speaking with positive mouth target",
          data: {
            mouthTarget,
            hasMorphTargets: mouthMorphTargetsRef.current.length > 0,
            hasJawBone: Boolean(jawBoneRef.current),
          },
          timestamp: Date.now(),
        }),
      }).catch(() => {});
      // #endregion
      hasLoggedSpeechApplyRef.current = true;
    }
    if (
      speakingRef.current &&
      mouthTarget === 0 &&
      !hasLoggedSilentSpeechRef.current
    ) {
      // #region agent log
      fetch("http://127.0.0.1:7646/ingest/6ad1a864-56ce-462c-9062-248741f1b63d", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Debug-Session-Id": "579b81",
        },
        body: JSON.stringify({
          sessionId: "579b81",
          runId: "pre-fix",
          hypothesisId: "H5",
          location: "components/CharacterCanvas.tsx:useFrameSpeakingZero",
          message: "Speaking but mouth target is zero",
          data: {
            hasCharacterTimestamps: targetMouthInfluenceRef.current !== 0,
            hasMorphTargets: mouthMorphTargetsRef.current.length > 0,
            hasJawBone: Boolean(jawBoneRef.current),
          },
          timestamp: Date.now(),
        }),
      }).catch(() => {});
      // #endregion
      hasLoggedSilentSpeechRef.current = true;
    }
    if (mouthMorphTargetsRef.current.length > 0) {
      for (const entry of mouthMorphTargetsRef.current) {
        const influences = entry.mesh.morphTargetInfluences;
        if (!influences) continue;
        for (const idx of entry.indices) {
          const current = influences[idx] ?? 0;
          Reflect.set(
            influences,
            idx,
            THREE.MathUtils.lerp(current, mouthTarget, 0.25)
          );
        }
      }
    } else if (jawBoneRef.current) {
      const jaw = jawBoneRef.current;
      const jawTarget = speakingRef.current ? mouthTarget * 0.35 : 0;
      jaw.rotation.x = THREE.MathUtils.lerp(
        jaw.rotation.x,
        jawInitialXRef.current - jawTarget,
        0.28
      );
    } else if (rigidMeshSpeechFallbackRef.current.length > 0) {
      for (const entry of rigidMeshSpeechFallbackRef.current) {
        const pulse = speakingRef.current
          ? 1 + mouthTarget * 0.14 + Math.sin(t * 10.5) * 0.035 * mouthTarget
          : 1;
        const squeeze = 2 - pulse;
        entry.mesh.scale.x = THREE.MathUtils.lerp(
          entry.mesh.scale.x,
          entry.baseScaleX * squeeze,
          0.35
        );
        entry.mesh.scale.y = THREE.MathUtils.lerp(
          entry.mesh.scale.y,
          entry.baseScaleY * pulse,
          0.35
        );
        entry.mesh.scale.z = THREE.MathUtils.lerp(
          entry.mesh.scale.z,
          entry.baseScaleZ * squeeze,
          0.35
        );
      }
      if (
        speakingRef.current &&
        mouthTarget > 0 &&
        !hasLoggedRigidSpeechApplyRef.current
      ) {
        // #region agent log
        fetch("http://127.0.0.1:7646/ingest/6ad1a864-56ce-462c-9062-248741f1b63d", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Debug-Session-Id": "579b81",
          },
          body: JSON.stringify({
            sessionId: "579b81",
            runId: "post-fix",
            hypothesisId: "F2",
            location: "components/CharacterCanvas.tsx:rigidFallbackApply",
            message: "Applied rigid mesh speech pulse",
            data: {
              mouthTarget,
              fallbackMeshCount: rigidMeshSpeechFallbackRef.current.length,
            },
            timestamp: Date.now(),
          }),
        }).catch(() => {});
        // #endregion
        hasLoggedRigidSpeechApplyRef.current = true;
      }

      // With fully rigid exports, exaggerate whole-body "speech beats"
      // so there is obvious on-screen movement when no jaw/morph rig exists.
      if (speakingRef.current) {
        const beat = mouthTarget * (0.09 + Math.abs(Math.sin(t * 9.8)) * 0.05);
        groupRef.current.position.y = baseY + Math.sin(t * 3.4) * 0.05 + beat;
        groupRef.current.rotation.x = Math.sin(t * 4.4) * 0.09;
        groupRef.current.rotation.y = Math.sin(t * 3.1) * 0.18;
      }
    }

    if (speakingRef.current) {
      // Avoid "jumping in place": if we have no lip rig, keep body mostly grounded
      // and talk via subtle head/torso movement.
      const bodyBob = hasLipRigRef.current
        ? Math.sin(t * 4.2) * 0.008
        : Math.sin(t * 3.2) * 0.028;
      groupRef.current.position.y = baseY + bodyBob;
      groupRef.current.rotation.y = hasLipRigRef.current
        ? Math.sin(t * 1.7) * 0.045
        : Math.sin(t * 2.7) * 0.12;
      groupRef.current.rotation.x = hasLipRigRef.current
        ? Math.sin(t * 2.8) * 0.016
        : Math.sin(t * 4.8) * 0.055;

      if (!hasLipRigRef.current && headBoneRef.current) {
        const pulse = 0.35 + Math.abs(Math.sin(t * 10.2));
        headBoneRef.current.rotation.x = THREE.MathUtils.lerp(
          headBoneRef.current.rotation.x,
          headInitialXRef.current + Math.sin(t * 11.5) * (0.11 * pulse),
          0.32
        );
        headBoneRef.current.rotation.y = THREE.MathUtils.lerp(
          headBoneRef.current.rotation.y,
          headInitialYRef.current + Math.sin(t * 6.2) * 0.06,
          0.3
        );
      }
      return;
    }

    if (stressedRef.current) {
      groupRef.current.position.y = baseY + Math.sin(t * 3) * 0.015;
      groupRef.current.rotation.y = Math.sin(t * 1.5) * 0.1;
      groupRef.current.rotation.x = Math.sin(t * 2) * 0.02;
      return;
    }

    groupRef.current.position.y = baseY + Math.sin(t * 1.2) * 0.005;
    groupRef.current.rotation.y = 0;
    groupRef.current.rotation.x = 0;
    if (headBoneRef.current) {
      headBoneRef.current.rotation.x = THREE.MathUtils.lerp(
        headBoneRef.current.rotation.x,
        headInitialXRef.current,
        0.16
      );
      headBoneRef.current.rotation.y = THREE.MathUtils.lerp(
        headBoneRef.current.rotation.y,
        headInitialYRef.current,
        0.16
      );
    }
  });

  return (
    <group ref={groupRef}>
      <primitive object={scene} />
    </group>
  );
}

const StableGLBModel = memo(
  GLBCharacter,
  (prev, next) =>
    prev.url === next.url &&
    prev.animated === next.animated &&
    prev.speakingRef === next.speakingRef &&
    prev.stressedRef === next.stressedRef &&
    prev.targetMouthInfluenceRef === next.targetMouthInfluenceRef
);

export default function CharacterCanvas({
  modelPath,
  speaking,
  stressed,
  visemeTimeline,
  characterTimestamps,
  speechElapsedMs = 0,
}: CharacterCanvasProps) {
  const hasModelPath = typeof modelPath === "string" && modelPath.trim().length > 0;
  const containerRef = useRef<HTMLDivElement>(null);
  const speakingRef = useRef(speaking);
  const stressedRef = useRef(stressed);
  const targetMouthInfluenceRef = useRef(0);

  useEffect(() => {
    speakingRef.current = speaking;
    stressedRef.current = stressed;
  }, [speaking, stressed]);

  useEffect(() => {
    if (!speaking) {
      targetMouthInfluenceRef.current = 0;
      return;
    }
    const influence = getTimestampMouthInfluence(characterTimestamps, speechElapsedMs);
    targetMouthInfluenceRef.current =
      influence ?? getVisemeMouthInfluence(visemeTimeline, speechElapsedMs) ?? 0;
  }, [characterTimestamps, visemeTimeline, speechElapsedMs, speaking]);

  useEffect(() => {
    if (!hasModelPath) return;
    useGLTF.preload(modelPath!.trim());
  }, [hasModelPath, modelPath]);

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        minHeight: "560px",
        position: "relative",
        pointerEvents: "auto",
      }}
      ref={containerRef}
    >
      <Canvas
        frameloop="always"
        gl={{ antialias: true, alpha: false, powerPreference: "high-performance" }}
        onCreated={({ gl }) => {
          gl.setClearColor("#070E1A", 1);
          console.log("WebGL Context Created:", gl.getContextAttributes());
        }}
        style={{
          width: "100%",
          height: "100%",
          background: "#070E1A",
          pointerEvents: "auto",
          touchAction: "none",
        }}
      >
        <PerspectiveCamera makeDefault position={[0, 1.5, 4]} />

        <ambientLight intensity={1.75} />
        <spotLight
          position={[0, 4, 2]}
          intensity={22}
          angle={0.5}
          penumbra={0.7}
          color="#fff8f0"
        />
        <pointLight position={[-2, 2, 2]} intensity={6} color="#c7d8ff" />

        <OrbitControls
          makeDefault
          target={DEFAULT_TARGET}
          enableZoom
          enablePan={false}
          enableRotate
          enableDamping
          dampingFactor={0.12}
          minDistance={1.8}
          maxDistance={8}
          minPolarAngle={Math.PI / 5}
          maxPolarAngle={Math.PI / 1.45}
          onStart={() => console.log("OrbitControls: interaction start")}
          onEnd={() => console.log("OrbitControls: interaction end")}
        />

        <Suspense fallback={<LoadingFallback />}>
          {!hasModelPath ? (
            <PathFallbackSphere />
          ) : DEBUG_MODE === "mesh-only" ? (
            <DebugMesh />
          ) : (
            <StableGLBModel
              url={modelPath.trim()}
              animated={DEBUG_MODE === "model-animated"}
              speakingRef={speakingRef}
              stressedRef={stressedRef}
              targetMouthInfluenceRef={targetMouthInfluenceRef}
            />
          )}
        </Suspense>
      </Canvas>
    </div>
  );
}
