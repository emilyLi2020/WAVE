"use client";

import { motion } from "framer-motion";
import type { WavePhase } from "@/lib/types";

const flatPath = "M 0 200 Q 200 200 400 200 Q 600 200 800 200";
const risingPath = "M 0 200 Q 200 80 400 100 Q 600 120 800 200";
const peakPath = "M 0 200 Q 200 40 400 60 Q 600 80 800 200";
const fallingPath = "M 0 200 Q 200 140 400 160 Q 600 180 800 200";

const phasePath: Record<WavePhase, string> = {
  rising: risingPath,
  peak: peakPath,
  falling: fallingPath,
};

type Props = {
  phase: WavePhase;
  intensity: number;
};

export function WaveCanvas({ phase, intensity }: Props) {
  const amp = Math.min(1, 0.55 + intensity / 22);
  const target = phasePath[phase];

  return (
    <div className="w-full overflow-hidden rounded-2xl border border-foreground/10 bg-foreground/[0.03]">
      <svg
        viewBox="0 0 800 240"
        className="h-40 w-full text-sky-400/90"
        preserveAspectRatio="none"
        aria-hidden
      >
        <motion.path
          d={flatPath}
          fill="none"
          stroke="currentColor"
          strokeWidth={3 * amp}
          initial={false}
          animate={{ d: target }}
          transition={{ duration: 2.2, ease: "easeInOut" }}
        />
      </svg>
      <p className="px-4 pb-3 text-center text-xs text-foreground/50">
        Phase: <span className="font-medium text-foreground/80">{phase}</span>
      </p>
    </div>
  );
}
