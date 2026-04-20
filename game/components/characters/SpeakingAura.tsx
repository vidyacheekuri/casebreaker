"use client";

import { motion, AnimatePresence } from "framer-motion";

const CX = 50;
const CY = 38;
const INNER_R = 13;
const V_SCALE = 0.70; // vertical squeeze to match body aspect ratio

// Irregular spike lengths — mimics audio spectrum bars
const SPIKE_LENS = [2, 5, 1, 7, 3, 2, 6, 1, 4, 8, 2, 5, 1, 6, 3, 9, 1, 4, 6, 2, 7, 3, 1, 5, 8, 2, 4, 6, 1, 3, 7, 2, 5, 1, 8, 3, 4, 6, 2, 5];

const NUM = 40;
const SPIKES = Array.from({ length: NUM }, (_, i) => ({ deg: i * (360 / NUM), idx: i }))
  .filter(({ deg }) => !(deg > 108 && deg < 162)); // skip floor zone

function spikeData(deg: number, idx: number) {
  const rad  = (deg * Math.PI) / 180;
  const sLen = SPIKE_LENS[idx % SPIKE_LENS.length];

  const x1 = CX + Math.cos(rad) * INNER_R;
  const y1 = CY + Math.sin(rad) * INNER_R * V_SCALE;
  const x2 = CX + Math.cos(rad) * (INNER_R + sLen);
  const y2 = CY + Math.sin(rad) * (INNER_R + sLen) * V_SCALE;

  return {
    d:      `M ${x1.toFixed(1)} ${y1.toFixed(1)} L ${x2.toFixed(1)} ${y2.toFixed(1)}`,
    dur:    0.10 + (idx % 9) * 0.025,   // 0.10 – 0.32 s rapid cycle
    delay:  (idx % 13) * 0.022,          // stagger: 0 – 0.286 s
    sw:     0.35 + (idx % 3) * 0.2,     // 0.35 – 0.75 px thin sharp strokes
    bright: idx % 5 === 0,               // accent spikes
  };
}

export default function SpeakingAura({ speaking }: { speaking: boolean }) {
  return (
    <AnimatePresence>
      {speaking && (
        <motion.svg
          className="absolute inset-0 pointer-events-none"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          style={{ width: "100%", height: "100%", zIndex: 10 }}
        >
          <defs>
            <filter id="spike-glow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="0.18" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          <g filter="url(#spike-glow)">
            {SPIKES.map(({ deg, idx }) => {
              const { d, dur, delay, sw, bright } = spikeData(deg, idx);
              return (
                <motion.path
                  key={deg}
                  d={d}
                  stroke={bright ? "#FFF8C0" : "#D4A843"}
                  strokeWidth={sw}
                  strokeLinecap="butt"
                  fill="none"
                  initial={{ pathLength: 0, opacity: 0 }}
                  animate={{
                    pathLength: [0, 1, 0],
                    opacity:    [0, bright ? 1.0 : 0.8, 0],
                  }}
                  transition={{
                    duration:    dur,
                    repeat:      Infinity,
                    delay,
                    ease:        "linear",
                    repeatDelay: 0,
                  }}
                />
              );
            })}
          </g>
        </motion.svg>
      )}
    </AnimatePresence>
  );
}
