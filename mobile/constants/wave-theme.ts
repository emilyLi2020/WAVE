/**
 * Wave — dark oceanic visual system.
 *
 * Ported from the Claude Design handoff bundle (wave-remix). The web
 * prototype is dark-first with an Instrument Serif italic display face,
 * Geist Mono eyebrows, and a layered teal ocean behind every screen.
 * On native we map the serif/mono roles onto the platform system faces
 * (already exposed by constants/theme.ts) so nothing has to be bundled.
 *
 * This module is presentation-only. No screen logic depends on it.
 */

import { Fonts } from "@/constants/theme";

export const WaveColors = {
  // Backgrounds — deep ocean.
  bgDeep: "#02060d",
  bg: "#05101c",
  bgMid: "#07182a",

  // Ink.
  ink: "#f4faff",
  inkSoft: "rgba(244, 250, 255, 0.92)",
  inkMute: "rgba(244, 250, 255, 0.72)",
  inkFaint: "rgba(244, 250, 255, 0.50)",
  inkGhost: "rgba(244, 250, 255, 0.22)",

  // Accents — the wave itself.
  accent: "#22d3ee",
  waveGlow: "#5ce1d6",
  waveCrest: "#b8fff2",

  // Surfaces.
  surface: "rgba(232, 243, 252, 0.04)",
  surfaceMute: "rgba(232, 243, 252, 0.07)",
  border: "rgba(232, 243, 252, 0.10)",
  borderSoft: "rgba(232, 243, 252, 0.06)",
  borderGlow: "rgba(92, 225, 214, 0.35)",

  // Status.
  warn: "#f0c987",
  warnSoft: "rgba(240, 201, 135, 0.14)",
  danger: "#f87171",
  dangerSoft: "rgba(248, 113, 113, 0.14)",

  // Chip pressed wash.
  chipActive: "rgba(92, 225, 214, 0.10)",
  chipActiveBorder: "rgba(92, 225, 214, 0.55)",
} as const;

export const WaveRadius = {
  sm: 10,
  md: 16,
  lg: 22,
  xl: 30,
  pill: 999,
} as const;

export const WaveSpacing = {
  screenX: 26,
  gap: 14,
} as const;

/**
 * Type roles. `serif` carries every emotional headline (italic), `mono`
 * carries eyebrows / metadata (uppercase, tracked), `sans` carries body UI.
 */
export const WaveType = {
  serif: Fonts.serif,
  mono: Fonts.mono,
  sans: Fonts.sans,
} as const;

/** The deep-ocean wash used as the static base of every screen. */
export const OCEAN_BACKGROUND_IMAGE = [
  "radial-gradient(circle at 18% 8%, rgba(34, 211, 238, 0.12) 0%, transparent 55%)",
  "radial-gradient(circle at 85% 96%, rgba(92, 225, 214, 0.08) 0%, transparent 55%)",
  "linear-gradient(to bottom, #02060d 0%, #040a14 55%, #020509 100%)",
].join(", ");
