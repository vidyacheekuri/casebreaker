"use client";

import { useCallback, useEffect, useRef } from "react";
import { useGameStore } from "@/lib/store";

const RAIN_SCREENS = new Set(["cinematic", "manor", "room", "evidence", "interrogation", "accusation", "verdict"]);
const CLOCK_SCREENS = new Set(["cinematic", "manor", "evidence"]);
const DRONE_SCREENS = new Set(["cinematic"]);
const HEART_SCREENS = new Set(["interrogation"]);

function makeBrownNoiseBuffer(ctx: AudioContext): AudioBuffer {
  const len = ctx.sampleRate * 4;
  const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let last = 0;

  for (let index = 0; index < len; index += 1) {
    const white = Math.random() * 2 - 1;
    data[index] = (last + 0.02 * white) / 1.02;
    last = data[index];
    data[index] *= 4;
  }

  return buffer;
}

export default function AmbientSound() {
  const screen = useGameStore((state) => state.screen);
  const suspectStress = useGameStore((state) => state.suspectStress);
  const selectedSuspectId = useGameStore((state) => state.selectedSuspectId);

  const ctxRef = useRef<AudioContext | null>(null);
  const masterRef = useRef<GainNode | null>(null);
  const rainGainRef = useRef<GainNode | null>(null);
  const clockGainRef = useRef<GainNode | null>(null);
  const droneGainRef = useRef<GainNode | null>(null);
  const heartGainRef = useRef<GainNode | null>(null);
  const clockTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const heartTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const initializedRef = useRef(false);

  const initAudio = useCallback(() => {
    if (initializedRef.current) {
      return;
    }

    initializedRef.current = true;
    const ctx = new AudioContext();
    ctxRef.current = ctx;

    const master = ctx.createGain();
    master.gain.value = 0.8;
    master.connect(ctx.destination);
    masterRef.current = master;

    const rainGain = ctx.createGain();
    rainGain.gain.value = 0;
    const lowPass = ctx.createBiquadFilter();
    lowPass.type = "lowpass";
    lowPass.frequency.value = 380;
    lowPass.Q.value = 0.3;

    const rainSource = ctx.createBufferSource();
    rainSource.buffer = makeBrownNoiseBuffer(ctx);
    rainSource.loop = true;
    rainSource.connect(lowPass);
    lowPass.connect(rainGain);
    rainGain.connect(master);
    rainSource.start();
    rainGainRef.current = rainGain;

    const clockGain = ctx.createGain();
    clockGain.gain.value = 0;
    clockGain.connect(master);
    clockGainRef.current = clockGain;

    const droneGain = ctx.createGain();
    droneGain.gain.value = 0;
    const droneFilter = ctx.createBiquadFilter();
    droneFilter.type = "lowpass";
    droneFilter.frequency.value = 220;
    const droneA = ctx.createOscillator();
    droneA.type = "sawtooth";
    droneA.frequency.value = 42;
    const droneB = ctx.createOscillator();
    droneB.type = "sine";
    droneB.frequency.value = 57;
    droneA.connect(droneFilter);
    droneB.connect(droneFilter);
    droneFilter.connect(droneGain);
    droneGain.connect(master);
    droneA.start();
    droneB.start();
    droneGainRef.current = droneGain;

    const heartGain = ctx.createGain();
    heartGain.gain.value = 0;
    heartGain.connect(master);
    heartGainRef.current = heartGain;
  }, []);

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

  const playClockTick = useCallback(() => {
    const ctx = ctxRef.current;
    const gain = clockGainRef.current;
    if (!ctx || !gain) {
      return;
    }

    const osc = ctx.createOscillator();
    const pulse = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = 1600;
    pulse.gain.setValueAtTime(0, ctx.currentTime);
    pulse.gain.linearRampToValueAtTime(0.12, ctx.currentTime + 0.004);
    pulse.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.07);
    osc.connect(pulse);
    pulse.connect(gain);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.08);
  }, []);

  const playHeartbeat = useCallback(() => {
    const ctx = ctxRef.current;
    const gain = heartGainRef.current;
    if (!ctx || !gain) {
      return;
    }

    const lub = ctx.createOscillator();
    const lubGain = ctx.createGain();
    lub.type = "sine";
    lub.frequency.value = 65;
    lubGain.gain.setValueAtTime(0, ctx.currentTime);
    lubGain.gain.linearRampToValueAtTime(0.5, ctx.currentTime + 0.05);
    lubGain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.22);
    lub.connect(lubGain);
    lubGain.connect(gain);
    lub.start(ctx.currentTime);
    lub.stop(ctx.currentTime + 0.25);

    const dub = ctx.createOscillator();
    const dubGain = ctx.createGain();
    dub.type = "sine";
    dub.frequency.value = 50;
    dubGain.gain.setValueAtTime(0, ctx.currentTime + 0.2);
    dubGain.gain.linearRampToValueAtTime(0.35, ctx.currentTime + 0.25);
    dubGain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.4);
    dub.connect(dubGain);
    dubGain.connect(gain);
    dub.start(ctx.currentTime + 0.2);
    dub.stop(ctx.currentTime + 0.42);
  }, []);

  useEffect(() => {
    const ctx = ctxRef.current;
    const gain = rainGainRef.current;
    if (!ctx || !gain) {
      return;
    }

    const target = RAIN_SCREENS.has(screen) ? 0.055 : 0;
    gain.gain.setTargetAtTime(target, ctx.currentTime, 2);
  }, [screen]);

  useEffect(() => {
    const ctx = ctxRef.current;
    const gain = droneGainRef.current;
    if (!ctx || !gain) {
      return;
    }

    const target = DRONE_SCREENS.has(screen) ? 0.035 : 0;
    gain.gain.setTargetAtTime(target, ctx.currentTime, 1.4);
  }, [screen]);

  useEffect(() => {
    const ctx = ctxRef.current;
    const gain = clockGainRef.current;
    if (!ctx || !gain) {
      return;
    }

    if (CLOCK_SCREENS.has(screen)) {
      gain.gain.setTargetAtTime(1, ctx.currentTime, 0.8);
      if (!clockTimerRef.current) {
        playClockTick();
        clockTimerRef.current = setInterval(playClockTick, 1000);
      }
      return;
    }

    gain.gain.setTargetAtTime(0, ctx.currentTime, 0.5);
    if (clockTimerRef.current) {
      clearInterval(clockTimerRef.current);
      clockTimerRef.current = null;
    }
  }, [playClockTick, screen]);

  useEffect(() => {
    const ctx = ctxRef.current;
    const gain = heartGainRef.current;
    if (!ctx || !gain) {
      return;
    }

    if (heartTimerRef.current) {
      clearInterval(heartTimerRef.current);
      heartTimerRef.current = null;
    }

    if (!HEART_SCREENS.has(screen) || !selectedSuspectId) {
      gain.gain.setTargetAtTime(0, ctx.currentTime, 0.5);
      return;
    }

    const stress = suspectStress[selectedSuspectId] ?? 0;
    if (stress <= 75) {
      gain.gain.setTargetAtTime(0, ctx.currentTime, 0.5);
      return;
    }

    const t = (stress - 75) / 25;
    const bpm = 60 + t * 20;
    const msPerBeat = (60 / bpm) * 1000;

    gain.gain.setTargetAtTime(0.08 + t * 0.12, ctx.currentTime, 0.5);
    playHeartbeat();
    heartTimerRef.current = setInterval(playHeartbeat, msPerBeat);
  }, [playHeartbeat, screen, selectedSuspectId, suspectStress]);

  useEffect(() => {
    return () => {
      if (clockTimerRef.current) {
        clearInterval(clockTimerRef.current);
      }
      if (heartTimerRef.current) {
        clearInterval(heartTimerRef.current);
      }
      ctxRef.current?.close();
    };
  }, []);

  useEffect(() => {
    let frame = 0;
    let smoothed = 0;
    const tick = () => {
      const ctx = ctxRef.current;
      if (ctx) {
        const rain = rainGainRef.current?.gain.value ?? 0;
        const heart = heartGainRef.current?.gain.value ?? 0;
        const clockPulse = clockTimerRef.current != null ? 0.14 : 0;
        const raw = Math.min(1, rain * 6.5 + heart * 8.5 + clockPulse);
        smoothed += (raw - smoothed) * 0.14;
        useGameStore.getState().setAmbientAudioIntensity(smoothed);
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  return null;
}
