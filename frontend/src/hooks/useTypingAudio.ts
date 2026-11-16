import { useCallback, useRef, useState } from "react";

export function useTypingAudio() {
  const audioCtxRef = useRef<AudioContext | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(true);

  const unlockAudio = useCallback(() => {
    if (!audioCtxRef.current && typeof window !== "undefined") {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        audioCtxRef.current = new AudioCtx();
      }
    }
    if (audioCtxRef.current?.state === "suspended") {
      void audioCtxRef.current.resume();
    }
  }, []);

  const playTick = useCallback(() => {
    if (!soundEnabled || !audioCtxRef.current) return;
    const ctx = audioCtxRef.current;
    if (ctx.state === "suspended") {
      void ctx.resume();
    }
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "square";
    osc.frequency.setValueAtTime(100 + Math.random() * 50, ctx.currentTime);
    gain.gain.setValueAtTime(0.015, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.04);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.04);
  }, [soundEnabled]);

  const toggleSound = useCallback(() => {
    unlockAudio();
    setSoundEnabled((prev) => !prev);
  }, [unlockAudio]);

  return { soundEnabled, toggleSound, unlockAudio, playTick };
}

