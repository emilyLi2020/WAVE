// Chunk — guided narration player. Still a skeleton ahead of the
// generateChunk() + Kokoro wiring; it shows the first narration beat
// statically. Re-skinned to the dark oceanic chunk player. Navigation
// (Next → /session/checkin) is unchanged.

import { useRouter } from "expo-router";
import { StyleSheet, Text, View } from "react-native";

import {
  Eyebrow,
  TopBar,
  WaveButton,
  WaveCard,
  WaveScreen,
} from "@/components/wave-ui";
import { WaveColors, WaveType } from "@/constants/wave-theme";

export default function ChunkScreenRoute() {
  const router = useRouter();

  return (
    <WaveScreen>
      <TopBar crumb="Chunk 1 of 5 · Settle" />

      <View style={styles.progress}>
        <View style={styles.progressFill} />
      </View>

      <Text style={styles.meta}>CHUNK 1 OF 5 · SETTLE</Text>

      <View style={styles.lineWrap}>
        <Text style={styles.line}>
          You&apos;re here. That&apos;s already the hardest part.
        </Text>
        <Text style={styles.subline}>
          Cravings rise. They peak. They fall. Like a wave.
        </Text>
      </View>

      <WaveCard accent style={styles.medAck}>
        <Eyebrow accent>Medication-aware</Eyebrow>
        <Text style={styles.medText}>
          Your Suboxone is working right now. What you&apos;re feeling at a 7
          would be a 9 or 10 without it.
        </Text>
      </WaveCard>

      <WaveButton
        label="Next →"
        variant="ghost"
        onPress={() => router.push("/session/checkin")}
        style={styles.next}
      />
    </WaveScreen>
  );
}

const styles = StyleSheet.create({
  progress: {
    height: 2,
    borderRadius: 999,
    backgroundColor: WaveColors.borderSoft,
    overflow: "hidden",
    marginTop: 6,
  },
  progressFill: {
    height: "100%",
    width: "20%",
    borderRadius: 999,
    backgroundColor: WaveColors.waveGlow,
  },
  meta: {
    textAlign: "center",
    marginTop: 16,
    fontFamily: WaveType.mono,
    fontSize: 9.5,
    letterSpacing: 2.6,
    color: WaveColors.inkFaint,
  },
  lineWrap: { flex: 1, justifyContent: "center", gap: 22, paddingVertical: 60 },
  line: {
    fontFamily: WaveType.serif,
    fontStyle: "italic",
    fontSize: 26,
    lineHeight: 33,
    textAlign: "center",
    color: WaveColors.ink,
    paddingHorizontal: 12,
  },
  subline: {
    fontFamily: WaveType.serif,
    fontStyle: "italic",
    fontSize: 19,
    lineHeight: 26,
    textAlign: "center",
    color: WaveColors.inkMute,
    paddingHorizontal: 12,
  },
  medAck: { flexDirection: "column", gap: 6 },
  medText: {
    color: WaveColors.inkSoft,
    fontSize: 12.5,
    lineHeight: 19,
    fontFamily: WaveType.sans,
  },
  next: { alignSelf: "flex-end", marginTop: 8 },
});
