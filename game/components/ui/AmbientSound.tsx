"use client";

import { useEffect, useRef, useCallback } from "react";
import { useGameStore } from "@/lib/store";

const RAIN_SCREENS = new Set(["cinematic", "manor", "room", "evidence", "interrogation", "accusation", "verdict"]);
const CLOCK_SCREENS = new Set(["cinematic", "manor", "evidence"]);
const HEART_SCREENS = new Set(["interrogation"]);

function makeBrownNoiseBuffer(ctx: AudioContext): AudioBuffer {
  const len = ctx.sampleRate * 4;
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    d[i] = (last + 0.02 * w) / 1.02;
    last = d[i];
    d[i] *= 4;
  }
  return buf;
}

export default function AmbientSound() {
  const screen = useGameStore((s) => s.screen);
  const suspectStress = useGameStore((s) => s.suspectStress);
  const selectedSuspect = useGameStore((s) => s.selectedSuspect);

  const ctxRef = useRef<AudioContext | null>(null);
  const masterRef = useRef<GainNode | null>(null);
  const rainGainRef = useRef<GainNode | null>(null);
  const clockGainRef = useRef<GainNode | null>(null);
  const heartGainRef = useRef<GainNode | null>(null);
  const clockIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const heartIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const initializedRef = useRef(false);

  const initAudio = useCallback(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    const ctx = new AudioContext();
    ctxRef.current = ctx;

    const master = ctx.createGain();
    master.gain.value = 0.8;
    master.connect(ctx.destination);
    masterRef.current = master;

    // Rain: brown noise → lowpass filter
    const rainGain = ctx.createGain();
    rainGain.gain.value = 0;
    const lpf = ctx.createBiquadFilter();
    lpf.type = "lowpass";
    lpf.frequency.value = 380;
    lpf.Q.value = 0.3;
    const brownBuf = makeBrownNoiseBuffer(ctx);
    const rainSrc = ctx.createBufferSource();
    rainSrc.buffer = brownBuf;
    rainSrc.loop = true;
    rainSrc.connect(lpf);
    lpf.connect(rainGain);
    rainGain.connect(master);
    rainSrc.start();
    rainGainRef.current = rainGain;

    // Clock: oscillator bursts routed through a gain node
    const clockGain = ctx.createGain();
    clockGain.gain.value = 0;
    clockGain.connect(master);
    clockGainRef.current = clockGain;

    // Heartbeat: low-frequency oscillator pulses
    const heartGain = ctx.createGain();
    heartGain.gain.value = 0;
    heartGain.connect(master);
    heartGainRef.current = heartGain;
  }, []);

  // Initialize on first user interaction (browser autoplay policy)
  useEffect(() => {
    const init = () => {
      initAudio();
      window.removeEventListener("click", init);
      window.removeEventListener("keydown", init);
    };
    window.addEventListener("click", init);
    window.addEventListener("keydown", init);
    return () => {
      window.removeEventListener("click", init);
      window.removeEventListener("keydown", init);
    };
  }, [initAudio]);

  const scheduleTick = useCallback(() => {
    const ctx = ctxRef.current;
    const clockGain = clockGainRef.current;
    if (!ctx || !clockGain) return;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = 1600;
    g.gain.setValueAtTime(0, ctx.currentTime);
    g.gain.linearRampToValueAtTime(0.12, ctx.currentTime + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.07);
    osc.connect(g);
    g.connect(clockGain);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.08);
  }, []);

  const scheduleHeartbeat = useCallback((bpm: number) => {
    const ctx = ctxRef.current;
    const heartGain = heartGainRef.current;
    if (!ctx || !heartGain) return;
    // Lub
    const lub = ctx.createOscillator();
    const lubG = ctx.createGain();
    lub.type = "sine";
    lub.frequency.value = 65;
    lubG.gain.setValueAtTime(0, ctx.currentTime);
    lubG.gain.linearRampToValueAtTime(0.5, ctx.currentTime + 0.05);
    lubG.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.22);
    lub.connect(lubG);
    lubG.connect(heartGain);
    lub.start(ctx.currentTime);
    lub.stop(ctx.currentTime + 0.25);
    // Dub
    const dub = ctx.createOscillator();
    const dubG = ctx.createGain();
    dub.type = "sine";
    dub.frequency.value = 50;
    dubG.gain.setValueAtTime(0, ctx.currentTime + 0.2);
    dubG.gain.linearRampToValueAtTime(0.35, ctx.currentTime + 0.25);
    dubG.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.4);
    dub.connect(dubG);
    dubG.connect(heartGain);
    dub.start(ctx.currentTime + 0.2);
    dub.stop(ctx.currentTime + 0.42);
    // Schedule next beat
    const msPerBeat = (60 / bpm) * 1000;
    heartIntervalRef.current = setTimeout(() => scheduleHeartbeat(bpm), msPerBeat) as unknown as ReturnType<typeof setInterval>;
  }, []);

  // Rain: fade based on screen
  useEffect(() => {
    const ctx = ctxRef.current;
    const gain = rainGainRef.current;
    if (!ctx || !gain) return;
    const target = RAIN_SCREENS.has(screen) ? 0.055 : 0;
    gain.gain.setTargetAtTime(target, ctx.currentTime, 2);
  }, [screen]);

  // Clock: start/stop + fade
  useEffect(() => {
    const ctx = ctxRef.current;
    const gain = clockGainRef.current;
    if (!ctx || !gain) return;
    if (CLOCK_SCREENS.has(screen)) {
      gain.gain.setTargetAtTime(1, ctx.currentTime, 0.8);
      if (!clockIntervalRef.current) {
        scheduleTick();
        clockIntervalRef.current = setInterval(scheduleTick, 1000);
      }
    } else {
      gain.gain.setTargetAtTime(0, ctx.currentTime, 0.5);
      if (clockIntervalRef.current) {
        clearInterval(clockIntervalRef.current);
        clockIntervalRef.current = null;
      }
    }
  }, [screen, scheduleTick]);

  // Heartbeat: active in interrogation when stress > 75
  useEffect(() => {
    const ctx = ctxRef.current;
    const gain = heartGainRef.current;
    if (!ctx || !gain) return;

    if (heartIntervalRef.current) {
      clearTimeout(heartIntervalRef.current as unknown as ReturnType<typeof setTimeout>);
      heartIntervalRef.current = null;
    }

    if (!HEART_SCREENS.has(screen) || !selectedSuspect) {
      gain.gain.setTargetAtTime(0, ctx.currentTime, 0.5);
      return;
    }

    const stress = suspectStress[selectedSuspect] ?? 0;
    if (stress > 75) {
      const t = (stress - 75) / 25; // 0–1
      gain.gain.setTargetAtTime(0.08 + t * 0.12, ctx.currentTime, 0.5);
      scheduleHeartbeat(60 + t * 20);
    } else {
      gain.gain.setTargetAtTime(0, ctx.currentTime, 0.5);
    }
  }, [screen, suspectStress, selectedSuspect, scheduleHeartbeat]);

  useEffect(() => {
    return () => {
      if (clockIntervalRef.current) clearInterval(clockIntervalRef.current);
      if (heartIntervalRef.current) clearTimeout(heartIntervalRef.current as unknown as ReturnType<typeof setTimeout>);
      ctxRef.current?.close();
    };
  }, []);

  return null;
}
