"use client";

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
};

type PreparedScene = {
  scene: THREE.Object3D;
  torsoY: number;
  camZ: number;
  driver: JawDriver | null;
};

function matchesAny(name: string, keywords: readonly string[]): boolean {
  const lower = name.toLowerCase();
  return keywords.some((keyword) => lower.includes(keyword));
}

function findJawDriver(root: THREE.Object3D): JawDriver | null {
  const jawMatches: THREE.Object3D[] = [];
  const headMatches: THREE.Object3D[] = [];

  root.traverse((object) => {
    if (matchesAny(object.name, JAW_BONE_KEYWORDS)) {
      jawMatches.push(object);
    } else if (matchesAny(object.name, HEAD_BONE_KEYWORDS)) {
      headMatches.push(object);
    }
  });

  const chosen = jawMatches[0] ?? headMatches[0] ?? null;
  if (!chosen) {
    return null;
  }

  const usingJaw = jawMatches.length > 0;
  const axis: "x" | "y" = usingJaw ? "x" : "y";
  const restAngle = usingJaw ? chosen.rotation.x : chosen.rotation.y;
  const openAngle = restAngle + (usingJaw ? JAW_OPEN_RADIANS : HEAD_TURN_RADIANS);

  return { bone: chosen, axis, restAngle, openAngle };
}

function prepareScene(baseScene: THREE.Object3D): PreparedScene {
  const cloned = baseScene.clone();
  cloned.updateMatrixWorld(true);

  const box = new THREE.Box3().setFromObject(cloned);
  let torsoY = 1.15;
  let camZ = 3.1;

  if (!box.isEmpty()) {
    const center = box.getCenter(new THREE.Vector3());
    cloned.position.x -= center.x;
    cloned.position.z -= center.z;
    cloned.position.y -= box.min.y;

    box.setFromObject(cloned);
    const height = box.max.y - box.min.y;
    torsoY = height * 0.62;
    camZ = Math.max(2.5, height * 2.1);
  }

  cloned.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) {
      return;
    }

    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of materials) {
      if (!material) {
        continue;
      }
      const standard = material as THREE.MeshStandardMaterial;
      standard.depthWrite = true;
      standard.side = THREE.DoubleSide;
      standard.needsUpdate = true;
    }
  });

  return {
    scene: cloned,
    torsoY,
    camZ,
    driver: findJawDriver(cloned),
  };
}

interface Props {
  url: string;
  speakingRef: React.MutableRefObject<boolean>;
}

function CharacterModel({ url, speakingRef }: Props) {
  const { scene } = useGLTF(url);
  const { camera } = useThree();
  const driverRef = useRef<JawDriver | null>(null);

  const prepared = useMemo(() => prepareScene(scene), [scene]);

  useEffect(() => {
    camera.position.set(0, prepared.torsoY + 0.1, prepared.camZ);
    (camera as THREE.PerspectiveCamera).lookAt(0, prepared.torsoY, 0);
    driverRef.current = prepared.driver;
  }, [camera, prepared]);

  useFrame(({ clock }) => {
    const driver = driverRef.current;
    if (!driver) {
      return;
    }

    let target = 0;
    if (speakingRef.current) {
      const elapsed = clock.getElapsedTime();
      const oscillator = (Math.sin(elapsed * 9.3) + Math.sin(elapsed * 14.7)) * 0.5;
      target = THREE.MathUtils.clamp(oscillator * 0.65 + 0.25, 0, 1);
    }

    const desired = THREE.MathUtils.lerp(driver.restAngle, driver.openAngle, target);
    const current = driver.bone.rotation[driver.axis];
    driver.bone.rotation[driver.axis] = THREE.MathUtils.lerp(current, desired, 0.25);
  });

  return (
    <group rotation={[0, Math.PI / 2, 0]}>
      <primitive object={prepared.scene} />
    </group>
  );
}

export default memo(CharacterModel, (prev, next) => prev.url === next.url && prev.speakingRef === next.speakingRef);
