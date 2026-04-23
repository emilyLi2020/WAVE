"use client";

/**
 * Animated wave visualization for the session.
 *
 * Two modes:
 *
 *   - `ambient` — a continuous slow ocean swell. Used during all
 *                 non-breath segments (text, pause) and during the
 *                 check-in chat. Two layered SVG sine paths slide
 *                 horizontally at different speeds via SMIL
 *                 <animateTransform> for an infinite-ocean illusion.
 *
 *   - `breath`  — synced to the active breath segment. Fill height
 *                 eases over `breathDurationSec`:
 *                   inhale → rises from baseline to peak,
 *                   hold   → holds at peak,
 *                   exhale → recedes from peak to baseline.
 *                 The horizontal slide continues underneath so the
 *                 surface still feels alive at peak; only the height
 *                 is driven by the breath phase.
 *
 * Intensity-driven fill height (the legacy slider behaviour) is
 * intentionally removed — height is derived from `mode` and
 * `breathPhase` only. See PRD § Session Runtime Requirements rule 5.
 */

import { useEffect, useRef, useState } from "react";

interface AmbientProps {
  mode: "ambient";
  breathPhase?: undefined;
  breathDurationSec?: undefined;
}

interface BreathProps {
  mode: "breath";
  breathPhase: "inhale" | "hold" | "exhale";
  breathDurationSec: number;
}

type AnimatedWaveProps = AmbientProps | BreathProps;

const VIEWBOX_WIDTH = 400;
const VIEWBOX_HEIGHT = 40;
const PERIOD = 100;
const BASELINE = 16;

const AMBIENT_FRONT_DURATION = "9s";
const AMBIENT_BACK_DURATION = "14s";
const AMBIENT_FILL_PERCENT = 38;

const BREATH_PEAK_PERCENT = 78;
const BREATH_BASELINE_PERCENT = 22;
const BREATH_FRONT_DURATION = "5s";
const BREATH_BACK_DURATION = "8s";

export function AnimatedWave(props: AnimatedWaveProps) {
  const fillPercent = useBreathDrivenHeight(props);
  const isBreath = props.mode === "breath";

  const frontColor = isBreath ? "var(--wave-peak)" : "var(--wave-rise)";
  const backColor = isBreath ? "var(--wave-rise)" : "var(--wave-peak)";
  const amplitude = isBreath ? 12 : 8;
  const frontDuration = isBreath
    ? BREATH_FRONT_DURATION
    : AMBIENT_FRONT_DURATION;
  const backDuration = isBreath
    ? BREATH_BACK_DURATION
    : AMBIENT_BACK_DURATION;

  const transitionMs =
    isBreath && props.breathPhase !== "hold"
      ? props.breathDurationSec * 1000
      : 700;

  return (
    <div
      aria-hidden
      className="relative h-40 overflow-hidden rounded-2xl border border-border bg-surface"
    >
      <div
        className="absolute inset-x-0 bottom-0"
        style={{
          height: `${fillPercent}%`,
          transition: `height ${transitionMs}ms ${
            isBreath ? "cubic-bezier(0.45, 0, 0.55, 1)" : "ease-out"
          }`,
        }}
      >
        <WaveLayer
          color={backColor}
          duration={backDuration}
          amplitude={amplitude * 0.7}
          opacity={0.5}
          offset={PERIOD / 2}
        />
        <WaveLayer
          color={frontColor}
          duration={frontDuration}
          amplitude={amplitude}
          opacity={0.9}
          offset={0}
        />
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background: `linear-gradient(to bottom, transparent 0%, ${frontColor} 60%)`,
            opacity: 0.4,
          }}
        />
      </div>
    </div>
  );
}

/**
 * Returns the current fill height as a percentage. Ambient mode is a
 * fixed mid-height so the wave looks alive without tracking anything.
 * Breath mode animates the height by switching the target percent
 * whenever the breath phase changes — the CSS transition above does the
 * easing over `breathDurationSec`.
 */
function useBreathDrivenHeight(props: AnimatedWaveProps): number {
  const [percent, setPercent] = useState(() =>
    props.mode === "breath"
      ? targetForPhase(props.breathPhase)
      : AMBIENT_FILL_PERCENT,
  );
  const lastPhaseRef = useRef<string | null>(
    props.mode === "breath" ? props.breathPhase : null,
  );

  useEffect(() => {
    if (props.mode === "ambient") {
      setPercent(AMBIENT_FILL_PERCENT);
      lastPhaseRef.current = null;
      return;
    }

    // Re-trigger the height transition whenever a new breath phase
    // begins. Setting state inside an effect that depends on the phase
    // is safe here because the new value lasts for the full
    // breathDurationSec window.
    if (lastPhaseRef.current !== props.breathPhase) {
      lastPhaseRef.current = props.breathPhase;
      setPercent(targetForPhase(props.breathPhase));
    }
  }, [props.mode, props.mode === "breath" ? props.breathPhase : null]);

  return percent;
}

function targetForPhase(phase: "inhale" | "hold" | "exhale"): number {
  switch (phase) {
    case "inhale":
      return BREATH_PEAK_PERCENT;
    case "hold":
      return BREATH_PEAK_PERCENT;
    case "exhale":
      return BREATH_BASELINE_PERCENT;
  }
}

function WaveLayer({
  color,
  duration,
  amplitude,
  opacity,
  offset,
}: {
  color: string;
  duration: string;
  amplitude: number;
  opacity: number;
  offset: number;
}) {
  return (
    <svg
      className="absolute left-0 right-0 -top-4 block h-10 w-full"
      viewBox={`0 0 ${VIEWBOX_WIDTH / 2} ${VIEWBOX_HEIGHT}`}
      preserveAspectRatio="none"
      style={{ opacity }}
    >
      <g>
        <animateTransform
          attributeName="transform"
          attributeType="XML"
          type="translate"
          from={`${offset} 0`}
          to={`${offset - PERIOD} 0`}
          dur={duration}
          repeatCount="indefinite"
        />
        <path d={buildWavePath(amplitude)} fill={color} />
      </g>
    </svg>
  );
}

function buildWavePath(amplitude: number): string {
  const segments: string[] = [`M 0 ${BASELINE}`];
  const total = VIEWBOX_WIDTH;
  const step = 4;

  for (let x = step; x <= total; x += step) {
    const y =
      BASELINE - Math.sin((x / PERIOD) * Math.PI * 2) * amplitude;
    segments.push(`L ${x} ${y.toFixed(2)}`);
  }

  segments.push(`L ${total} ${VIEWBOX_HEIGHT}`);
  segments.push(`L 0 ${VIEWBOX_HEIGHT}`);
  segments.push("Z");
  return segments.join(" ");
}
