// Check-in — task ③. ZERO flow interaction: it auto-starts the
// hands-free voice loop (agent asks the 1–10 opener, then VAD → Whisper
// → check-in LLM → Kokoro, multi-turn until the model/patient signals
// done), then dispatches checkInCompleted and the reducer routes onward.
// The only control is a tiny "skip check-in" ghost link as a stall
// escape — the page itself is not tappable.

import { useEffect, useRef } from "react";
import { useRouter } from "expo-router";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

import { Display, Pill, TopBar, WaveButton, WaveCard, WaveScreen } from "@/components/wave-ui";
import { WaveColors, WaveType } from "@/constants/wave-theme";
import { useSession } from "@/session/session-context";
import { useCheckInVoiceLoop, type LoopPhase } from "@/voice/use-check-in-voice-loop";

const STATUS_COPY: Record<LoopPhase, string> = {
  warming: "warming up",
  speaking: "WAVE is speaking",
  listening: "listening",
  recording: "you're speaking",
  transcribing: "transcribing",
  thinking: "thinking",
  done: "done",
  error: "voice error",
};

function Orb({ phase }: { phase: LoopPhase }) {
  const ring = useSharedValue(0);
  const fast = phase === "recording" || phase === "listening";
  useEffect(() => {
    ring.value = withRepeat(
      withTiming(1, {
        duration: fast ? 1100 : 2000,
        easing: Easing.out(Easing.ease),
      }),
      -1,
    );
  }, [ring, fast]);
  const r = useAnimatedStyle(() => ({
    transform: [{ scale: 0.9 + ring.value * (fast ? 1.7 : 1.3) }],
    opacity: 0.85 - ring.value * 0.85,
  }));
  const coreColor =
    phase === "recording"
      ? "#fca5a5"
      : phase === "speaking"
        ? WaveColors.waveCrest
        : WaveColors.waveGlow;
  return (
    <View style={styles.orb}>
      <Animated.View style={[styles.ring, r]} />
      <View style={[styles.core, { backgroundColor: coreColor }]} />
    </View>
  );
}

export default function CheckInScreenRoute() {
  const router = useRouter();
  const { state } = useSession();
  const { phase, messages, score, error, finishNow } = useCheckInVoiceLoop();
  const scrollRef = useRef<ScrollView>(null);

  // When the loop finalizes it dispatches checkInCompleted; the reducer
  // sets the next phase ("reflection" after the final round, otherwise
  // "loadingChunk"). Route off the REDUCER phase — don't recompute chunk
  // math here (currentChunk has already been advanced by then).
  const last = state.checkIns[state.checkIns.length - 1];
  useEffect(() => {
    if (phase !== "done") return;
    if (state.phase === "reflection") router.replace("/session/reflection");
    else router.replace("/session/chunk");
  }, [phase, router, state.phase]);

  const shownScore = score ?? last?.cravingScore ?? null;

  return (
    <WaveScreen intensity={shownScore ?? 7}>
      <TopBar
        crumb={`Check-in ${state.currentChunk} of ${state.totalChunks}`}
        trailing={<Pill>Voice · on-device</Pill>}
      />

      <Display size="lg" style={styles.center}>
        Where is it{"\n"}now?
      </Display>

      <WaveCard style={styles.voiceCard}>
        <Orb phase={phase} />
        <Text style={styles.state}>{STATUS_COPY[phase]}</Text>
        {shownScore != null ? (
          <Text style={styles.score}>
            {shownScore}
            <Text style={styles.scoreUnit}> /10</Text>
          </Text>
        ) : null}
      </WaveCard>

      <ScrollView
        ref={scrollRef}
        style={styles.transcript}
        contentContainerStyle={styles.transcriptContent}
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
        showsVerticalScrollIndicator={false}
      >
        {messages.length === 0 ? (
          <Text style={styles.empty}>
            Whisper transcribes you, Kokoro replies in voice.{"\n"}Nothing
            leaves the phone.
          </Text>
        ) : (
          messages.map((m, i) => (
            <View
              key={i}
              style={[
                styles.bubble,
                m.role === "user" ? styles.bubbleUser : styles.bubbleAgent,
              ]}
            >
              <Text
                style={[
                  styles.bubbleText,
                  m.role === "user" && styles.bubbleTextUser,
                ]}
              >
                {m.text || "…"}
              </Text>
            </View>
          ))
        )}
        {error ? <Text style={styles.err}>{error}</Text> : null}
      </ScrollView>

      <WaveButton
        label="skip check-in →"
        variant="ghost"
        onPress={finishNow}
        style={styles.skip}
      />
    </WaveScreen>
  );
}

const styles = StyleSheet.create({
  center: { textAlign: "center", marginTop: 6 },
  voiceCard: { alignItems: "center", gap: 10, marginTop: 8, paddingVertical: 22 },
  orb: { width: 78, height: 78, alignItems: "center", justifyContent: "center" },
  ring: {
    position: "absolute",
    width: 70,
    height: 70,
    borderRadius: 35,
    borderWidth: 1,
    borderColor: WaveColors.waveGlow,
  },
  core: {
    width: 22,
    height: 22,
    borderRadius: 11,
    shadowColor: WaveColors.waveGlow,
    shadowOpacity: 0.9,
    shadowRadius: 18,
  },
  state: {
    fontFamily: WaveType.mono,
    fontSize: 9.5,
    letterSpacing: 2,
    textTransform: "uppercase",
    color: WaveColors.inkFaint,
  },
  score: {
    fontFamily: WaveType.serif,
    fontStyle: "italic",
    fontSize: 44,
    lineHeight: 46,
    letterSpacing: -1,
    color: WaveColors.ink,
  },
  scoreUnit: { fontSize: 16, color: WaveColors.inkMute },
  transcript: { flexGrow: 0, maxHeight: 260, marginTop: 6 },
  transcriptContent: { gap: 8, paddingVertical: 6 },
  empty: {
    textAlign: "center",
    fontFamily: WaveType.serif,
    fontStyle: "italic",
    fontSize: 14,
    lineHeight: 21,
    color: WaveColors.inkMute,
    paddingVertical: 16,
  },
  bubble: {
    maxWidth: "86%",
    paddingVertical: 9,
    paddingHorizontal: 13,
    borderRadius: 16,
    borderCurve: "continuous",
  },
  bubbleAgent: {
    alignSelf: "flex-start",
    backgroundColor: WaveColors.surface,
    borderWidth: 1,
    borderColor: WaveColors.border,
    borderTopLeftRadius: 6,
  },
  bubbleUser: {
    alignSelf: "flex-end",
    backgroundColor: WaveColors.chipActive,
    borderWidth: 1,
    borderColor: WaveColors.chipActiveBorder,
    borderTopRightRadius: 6,
  },
  bubbleText: {
    fontFamily: WaveType.serif,
    fontStyle: "italic",
    fontSize: 15,
    lineHeight: 21,
    color: WaveColors.ink,
  },
  bubbleTextUser: { color: WaveColors.waveCrest },
  err: {
    color: WaveColors.danger,
    fontSize: 11,
    fontFamily: WaveType.mono,
    textAlign: "center",
    marginTop: 8,
  },
  skip: { alignSelf: "center", marginTop: 12 },
});
