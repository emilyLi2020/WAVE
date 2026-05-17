// Reflection — post-session card. Still a skeleton ahead of the
// generateReflection() wiring (src/gemma/session.ts is ported; the bind
// is not), so the summary copy is representative static text. Re-skinned
// to the dark oceanic reflection. Navigation (done → dev menu, "/") is
// unchanged.

import { useRouter } from "expo-router";
import { StyleSheet, Text, View } from "react-native";

import {
  Chip,
  Display,
  Eyebrow,
  TopBar,
  WaveButton,
  WaveCard,
  WaveScreen,
} from "@/components/wave-ui";
import { WaveColors, WaveType } from "@/constants/wave-theme";

const NEXT_STEPS = [
  "Glass of water · step outside for two minutes",
  'Text the person you trust most: "today is a hard one"',
  "Eat something small — a piece of fruit or toast",
  "Lie down for 10 minutes with a podcast you trust",
];

export default function ReflectionScreenRoute() {
  const router = useRouter();
  const finish = () => router.replace("/");

  return (
    <WaveScreen intensity={4}>
      <TopBar crumb="Closing · reflection" />

      <View style={styles.summaryBlock}>
        <Eyebrow accent>Your reflection</Eyebrow>
        <Display size="lg">
          Your craving fell{" "}
          <Text style={styles.hl}>3 points</Text>
          {"\n"}across the session.
        </Display>
      </View>

      <Text style={styles.insight}>
        When you noticed it in your chest, you stopped fighting it — that&apos;s
        when it started moving.
      </Text>

      <WaveCard style={styles.arcCard}>
        <Eyebrow>Intake → end</Eyebrow>
        <Text style={styles.arc}>7 · 7 · 6 · 5 · 4 · 4</Text>
      </WaveCard>

      <Eyebrow style={styles.stepsLabel}>Next 10 minutes · pick one</Eyebrow>
      <View style={styles.steps}>
        {NEXT_STEPS.map((s) => (
          <Chip key={s} label={s} onPress={finish} />
        ))}
      </View>

      <WaveButton label="done" variant="quiet" onPress={finish} style={styles.done} />
    </WaveScreen>
  );
}

const styles = StyleSheet.create({
  summaryBlock: { gap: 10, marginTop: 8 },
  hl: { color: WaveColors.waveCrest },
  insight: {
    fontFamily: WaveType.serif,
    fontStyle: "italic",
    fontSize: 14,
    lineHeight: 22,
    color: WaveColors.inkMute,
  },
  arcCard: { gap: 8 },
  arc: {
    fontFamily: WaveType.serif,
    fontStyle: "italic",
    fontSize: 22,
    letterSpacing: 1,
    color: WaveColors.waveCrest,
  },
  stepsLabel: { marginTop: 6 },
  steps: { gap: 6 },
  done: { alignSelf: "center", marginTop: 18 },
});
