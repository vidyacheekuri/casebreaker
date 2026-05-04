"use client";

import { useEffect } from "react";
import { useMotionValue, useSpring, useTransform, type MotionValue } from "framer-motion";

export function useParallaxPointer() {
  const rawX = useMotionValue(0);
  const rawY = useMotionValue(0);
  const springX = useSpring(rawX, { stiffness: 42, damping: 20 });
  const springY = useSpring(rawY, { stiffness: 42, damping: 20 });

  useEffect(() => {
    const handler = (event: MouseEvent) => {
      rawX.set(event.clientX / window.innerWidth - 0.5);
      rawY.set(event.clientY / window.innerHeight - 0.5);
    };
    window.addEventListener("mousemove", handler);
    return () => window.removeEventListener("mousemove", handler);
  }, [rawX, rawY]);

  return { springX, springY };
}

export function useParallaxShift(spring: MotionValue<number>, px: number) {
  return useTransform(spring, [-0.5, 0.5], [-px, px]);
}
