/**
 * WaveBackground — the single shared ocean that sits behind every screen.
 *
 * The Claude Design prototype drew this on a 2D canvas (three drifting
 * sine layers + atmospheric particles + a deep-water gradient). React
 * Native has no cheap canvas, so we recreate the *visual* with Reanimated:
 * a static deep-ocean gradient wash, three oversized arc "swell" layers
 * that drift sideways and bob, and a scatter of rising particles.
 *
 * Purely decorative — `pointerEvents="none"`, no props that change app
 * behaviour. `intensity` (1–10) only scales how tall the swells ride,
 * mirroring `WaveAPI.setScore` in the prototype.
 */

import { useEffect, useMemo } from "react";
import { StyleSheet, View, useWindowDimensions } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";

import { OCEAN_BACKGROUND_IMAGE, WaveColors } from "@/constants/wave-theme";

type SwellSpec = {
  fill: string;
  /** Fraction of screen height the crest rests at (0 = top). */
  rest: number;
  driftMs: number;
  bobMs: number;
  drift: number;
  bob: number;
  opacity: number;
};

function Swell({
  spec,
  width,
  height,
  amp,
}: {
  spec: SwellSpec;
  width: number;
  height: number;
  amp: number;
}) {
  const drift = useSharedValue(0);
  const bob = useSharedValue(0);

  useEffect(() => {
    drift.value = withRepeat(
      withSequence(
        withTiming(1, { duration: spec.driftMs, easing: Easing.inOut(Easing.sin) }),
        withTiming(0, { duration: spec.driftMs, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
    );
    bob.value = withRepeat(
      withSequence(
        withTiming(1, { duration: spec.bobMs, easing: Easing.inOut(Easing.quad) }),
        withTiming(0, { duration: spec.bobMs, easing: Easing.inOut(Easing.quad) }),
      ),
      -1,
    );
  }, [drift, bob, spec.driftMs, spec.bobMs]);

  const style = useAnimatedStyle(() => ({
    transform: [
      { translateX: -spec.drift / 2 + drift.value * spec.drift },
      { translateY: -bob.value * spec.bob - amp },
    ],
  }));

  // An oversized rounded slab: its huge top radius reads as a wide swell
  // crest. Width overshoots the screen so the sideways drift never reveals
  // an edge.
  const slabW = width * 2.4;
  const radius = slabW;

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.swell,
        {
          width: slabW,
          height: height,
          left: -(slabW - width) / 2,
          top: height * spec.rest,
          backgroundColor: spec.fill,
          borderTopLeftRadius: radius,
          borderTopRightRadius: radius,
          opacity: spec.opacity,
        },
        style,
      ]}
    />
  );
}

function Particle({ width, height, index }: { width: number; height: number; index: number }) {
  const t = useSharedValue(0);
  const seed = useMemo(() => ({
    x: (Math.sin(index * 12.9898) * 43758.5453) % 1,
    size: 0.6 + ((index * 7) % 5) * 0.35,
    dur: 14000 + ((index * 877) % 9000),
    delay: (index * 1300) % 9000,
  }), [index]);

  useEffect(() => {
    t.value = withDelay(
      seed.delay,
      withRepeat(withTiming(1, { duration: seed.dur, easing: Easing.linear }), -1),
    );
  }, [t, seed.delay, seed.dur]);

  const style = useAnimatedStyle(() => ({
    opacity: 0.05 + (1 - Math.abs(t.value - 0.5) * 2) * 0.22,
    transform: [{ translateY: height - t.value * (height + 40) }],
  }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.particle,
        {
          left: Math.abs(seed.x) * width,
          width: seed.size,
          height: seed.size,
          borderRadius: seed.size,
        },
        style,
      ]}
    />
  );
}

export function WaveBackground({ intensity = 4 }: { intensity?: number }) {
  const { width, height } = useWindowDimensions();

  // Score → extra crest rise, matching the prototype's amplitude curve.
  const amp = useMemo(() => {
    const clamped = Math.max(1, Math.min(10, intensity));
    return 6 + (clamped / 10) * 64;
  }, [intensity]);

  const swells: SwellSpec[] = useMemo(
    () => [
      { fill: "rgba(12, 60, 80, 0.55)", rest: 0.66, driftMs: 17000, bobMs: 6500, drift: 60, bob: 14, opacity: 0.9 },
      { fill: "rgba(20, 110, 130, 0.6)", rest: 0.74, driftMs: 13000, bobMs: 5200, drift: 90, bob: 20, opacity: 0.85 },
      { fill: "rgba(92, 225, 214, 0.34)", rest: 0.82, driftMs: 9500, bobMs: 4200, drift: 120, bob: 26, opacity: 0.8 },
    ],
    [],
  );

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <View
        style={[
          StyleSheet.absoluteFill,
          { experimental_backgroundImage: OCEAN_BACKGROUND_IMAGE },
        ]}
      />
      {Array.from({ length: 26 }).map((_, i) => (
        <Particle key={`p-${i}`} index={i} width={width} height={height} />
      ))}
      {swells.map((spec, i) => (
        <Swell key={`s-${i}`} spec={spec} width={width} height={height} amp={amp} />
      ))}
      {/* Crest glow + top-edge fade so content stays readable. */}
      <View
        style={[
          StyleSheet.absoluteFill,
          {
            experimental_backgroundImage:
              "linear-gradient(to bottom, rgba(2, 6, 13, 0.78) 0%, transparent 34%, transparent 70%, rgba(2, 6, 13, 0.32) 100%)",
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  swell: {
    position: "absolute",
  },
  particle: {
    position: "absolute",
    backgroundColor: WaveColors.waveCrest,
  },
});
