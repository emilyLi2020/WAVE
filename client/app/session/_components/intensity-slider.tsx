"use client";

import { useEffect, useId } from "react";

interface Props {
  value: number;
  onChange: (next: number) => void;
  /**
   * Called every 15 seconds with the current value, matching the PRD's
   * IntensitySample cadence (Data Model > Intensity sample).
   */
  onSample?: (value: number) => void;
}

const SAMPLE_INTERVAL_MS = 15_000;

export function IntensitySlider({ value, onChange, onSample }: Props) {
  const id = useId();

  useEffect(() => {
    if (!onSample) return;
    const interval = setInterval(() => {
      onSample(value);
    }, SAMPLE_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [value, onSample]);

  return (
    <div className="rounded-xl border border-border bg-surface-muted p-4">
      <div className="flex items-center justify-between">
        <label htmlFor={id} className="text-sm font-medium">
          Right now, the wave is at:
        </label>
        <span className="text-2xl font-semibold tabular-nums text-accent">
          {value}/10
        </span>
      </div>
      <input
        id={id}
        type="range"
        min={1}
        max={10}
        step={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-3 w-full accent-accent"
        aria-valuemin={1}
        aria-valuemax={10}
        aria-valuenow={value}
      />
      <div className="mt-1 flex justify-between text-[10px] uppercase tracking-wide text-foreground/50">
        <span>calm</span>
        <span>peak</span>
      </div>
    </div>
  );
}
