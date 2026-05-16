// Combined voice loop test page — the integrated VAD + STT + LiteRT + Kokoro
// path. Gated behind the three individual smoke tests passing first.
//
// This screen will host the production check-in voice loop (mirrors
// client/lib/voice/use-check-in-voice-loop.ts), but isolated in a test
// surface so we can iterate on tuning (VAD modes, sentence buffering,
// barge-in latency) without dragging the session machine.

import { ScrollView, StyleSheet, Text, View } from "react-native";

export default function CombinedVoiceTestScreen() {
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.heading}>Combined voice loop</Text>
      <Text style={styles.sub}>
        VAD (Silero) → Whisper STT → LiteRT LLM → Kokoro TTS, with barge-in.
      </Text>

      <View style={styles.panel}>
        <Text style={styles.panelHead}>Gates before this can run</Text>
        <Text style={styles.bodyText}>
          1. /tests/litert — chunk-1 JSON generates on device.
        </Text>
        <Text style={styles.bodyText}>
          2. /tests/whisper — mic → transcript round-trips.
        </Text>
        <Text style={styles.bodyText}>
          3. /tests/kokoro — text → audio plays through the device speaker.
        </Text>
        <Text style={[styles.bodyText, { marginTop: 8 }]}>
          Once those green up, this screen wires them into the conversational
          loop (sentence buffer, VAD-driven turn taking, sub-200ms barge-in).
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#08080C" },
  content: { padding: 16, gap: 12 },
  heading: { color: "#F1F1F4", fontSize: 20, fontWeight: "700" },
  sub: { color: "#9CA3AF", fontSize: 13 },
  panel: {
    backgroundColor: "#16161F",
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#23232F",
    gap: 6,
  },
  panelHead: {
    color: "#6B7280",
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 4,
  },
  bodyText: { color: "#F1F1F4", fontSize: 13, lineHeight: 18 },
});
