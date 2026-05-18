/**
 * Tiny module-level channel so the intake "drag-the-wave" control (deep
 * in the session tree) can drive the shared root-level WaveCanvas
 * amplitude live, without threading a prop through every layer.
 *
 * Mirrors the mobile session demo
 * (Wave-oceanic-step4/mobile/components/wave-background.tsx): the ocean
 * swell tracks the entered craving intensity. `null` means "no override"
 * — the canvas keeps its calm default amplitude.
 *
 * The canvas reads `getWaveIntensity()` once per animation frame and
 * eases toward it, so no React subscription is needed here.
 */

let current: number | null = null;

/** Set the live craving intensity (1–10), or `null` to clear the override. */
export function setWaveIntensity(value: number | null): void {
  current = value == null ? null : Math.max(1, Math.min(10, value));
}

/** Current intensity override, or `null` when the canvas should stay calm. */
export function getWaveIntensity(): number | null {
  return current;
}
