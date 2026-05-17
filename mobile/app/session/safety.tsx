// Safety — rule-based gate before any model call. Still a skeleton: the
// usedSubstanceToday flag is not yet threaded into the reducer, so every
// answer advances to /session/chunk exactly as the previous skeleton did.
// Re-skinned to the dark oceanic "have you used today" screen.

import { useRouter } from "expo-router";
import { StyleSheet, Text, View } from "react-native";

import {
  Chip,
  Display,
  Eyebrow,
  Lede,
  TopBar,
  WaveCard,
  WaveScreen,
} from "@/components/wave-ui";
import { WaveColors, WaveType } from "@/constants/wave-theme";

const ANSWERS = ["No, not today", "Yes, earlier today", "Yes, within the last hour"];

export default function SafetyScreenRoute() {
  const router = useRouter();
  const proceed = () => router.push("/session/chunk");

  return (
    <WaveScreen>
      <TopBar crumb="Before we start" onBack={() => router.back()} />

      <Eyebrow accent>Safety check</Eyebrow>
      <Display>Have you used today?</Display>
      <Lede>
        We ask so the session knows what to say next. There&apos;s no right
        answer and no judgment.
      </Lede>

      <View style={styles.options}>
        {ANSWERS.map((a) => (
          <Chip key={a} label={a} onPress={proceed} />
        ))}
      </View>

      <WaveCard style={styles.shield}>
        <Eyebrow accent>If you&apos;re in crisis</Eyebrow>
        <Text style={styles.shieldBody}>
          Call or text <Text style={styles.b}>988</Text> (Suicide &amp; Crisis
          Lifeline),{"\n"}or call SAMHSA at{" "}
          <Text style={styles.b}>1-800-662-HELP</Text>.{"\n"}WAVE is a support
          tool — not a substitute for a counselor or prescriber.
        </Text>
      </WaveCard>
    </WaveScreen>
  );
}

const styles = StyleSheet.create({
  options: { gap: 6, marginTop: 4 },
  shield: { marginTop: 16, gap: 8 },
  shieldBody: {
    color: WaveColors.inkSoft,
    fontSize: 13,
    lineHeight: 20,
    fontFamily: WaveType.sans,
  },
  b: { color: WaveColors.waveCrest, fontWeight: "700" },
});
