// Intake — session entry. Still a skeleton ahead of the session-reducer
// wiring (src/session/session-machine.ts is ported; the form binding is
// not). Re-skinned to the dark oceanic "how strong is it" intensity
// screen from the Claude Design handoff. The local `intensity` state is
// presentational only; it is not yet fed into the reducer. Navigation
// (continue → /session/safety) is unchanged.

import { useState } from "react";
import { useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";

import {
  Display,
  Hint,
  TopBar,
  WaveButton,
  WaveScreen,
} from "@/components/wave-ui";
import { WaveColors, WaveType } from "@/constants/wave-theme";

const INTENSITY_LABELS = [
  "",
  "barely there",
  "faint",
  "noticing it",
  "present",
  "hard to ignore",
  "pulling",
  "strong",
  "loud",
  "urgent",
  "all-consuming",
];

export default function IntakeScreen() {
  const router = useRouter();
  const [intensity, setIntensity] = useState<number | null>(null);
  const value = intensity ?? 5;

  return (
    <WaveScreen intensity={value}>
      <TopBar crumb="Intake · 1 / 4" onBack={() => router.back()} />

      <Display size="lg" style={styles.centered}>
        How strong is it,{"\n"}right now?
      </Display>

      <Text style={styles.help}>Tap where it feels right.</Text>
      <Hint style={styles.helpSub}>
        {intensity != null
          ? "You can change your mind."
          : "Higher is stronger. There's no wrong answer."}
      </Hint>

      <View style={styles.readout}>
        <Text
          style={[styles.readoutNum, intensity == null && styles.readoutDim]}
        >
          {value}
          <Text style={styles.readoutUnit}> /10</Text>
        </Text>
        <Text style={styles.readoutLbl}>
          {intensity != null ? INTENSITY_LABELS[value] : "drag the wave"}
        </Text>
      </View>

      <View style={styles.scale}>
        {Array.from({ length: 10 }).map((_, i) => {
          const n = i + 1;
          const active = intensity != null && n <= value;
          return (
            <Pressable
              key={n}
              onPress={() => setIntensity(n)}
              accessibilityRole="button"
              accessibilityLabel={`Intensity ${n}`}
              style={[styles.tick, active && styles.tickActive]}
            >
              <Text style={[styles.tickText, active && styles.tickTextActive]}>
                {n}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <WaveButton
        label="continue"
        onPress={() => router.push("/session/safety")}
        disabled={intensity == null}
        style={styles.cta}
      />
    </WaveScreen>
  );
}

const styles = StyleSheet.create({
  centered: { textAlign: "center", marginTop: 18 },
  help: {
    textAlign: "center",
    color: WaveColors.inkSoft,
    fontSize: 14,
    fontFamily: WaveType.sans,
    marginTop: 4,
  },
  helpSub: { textAlign: "center" },
  readout: { alignItems: "center", marginTop: 28, gap: 4 },
  readoutNum: {
    fontFamily: WaveType.serif,
    fontStyle: "italic",
    fontSize: 84,
    lineHeight: 88,
    letterSpacing: -2,
    color: WaveColors.ink,
  },
  readoutDim: { color: WaveColors.inkMute },
  readoutUnit: { fontSize: 22, color: WaveColors.inkMute },
  readoutLbl: {
    fontFamily: WaveType.serif,
    fontStyle: "italic",
    fontSize: 17,
    color: WaveColors.inkSoft,
  },
  scale: {
    flexDirection: "row",
    gap: 6,
    marginTop: 28,
    justifyContent: "center",
  },
  tick: {
    flex: 1,
    aspectRatio: 0.5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: WaveColors.border,
    backgroundColor: WaveColors.surface,
    alignItems: "center",
    justifyContent: "flex-end",
    paddingBottom: 8,
  },
  tickActive: {
    borderColor: WaveColors.chipActiveBorder,
    backgroundColor: WaveColors.chipActive,
  },
  tickText: {
    fontFamily: WaveType.mono,
    fontSize: 10,
    color: WaveColors.inkFaint,
  },
  tickTextActive: { color: WaveColors.waveCrest },
  cta: { marginTop: 36 },
});
