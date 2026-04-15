"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import type { WavePhase } from "@/lib/types";
import { PHASE_DURATIONS } from "@/store/sessionStore";

export function useWaveSequence(options: {
  active: boolean;
  onPhaseStart: (phase: WavePhase) => void;
  onComplete: () => void;
}) {
  const { active, onPhaseStart, onComplete } = options;
  const phaseRef = useRef(onPhaseStart);
  const endRef = useRef(onComplete);

  useLayoutEffect(() => {
    phaseRef.current = onPhaseStart;
    endRef.current = onComplete;
  }, [onPhaseStart, onComplete]);

  useEffect(() => {
    if (!active) return;
    const timers: number[] = [];
    let total = 0;
    for (const phase of ["rising", "peak", "falling"] as const) {
      const t = window.setTimeout(() => phaseRef.current(phase), total);
      timers.push(t);
      total += PHASE_DURATIONS[phase] * 1000;
    }
    timers.push(window.setTimeout(() => endRef.current(), total));
    return () => {
      for (const id of timers) window.clearTimeout(id);
    };
  }, [active]);
}
