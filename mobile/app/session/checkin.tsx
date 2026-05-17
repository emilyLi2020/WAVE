// Check-in — production surface for the conversational voice loop
// (src/voice/use-check-in-voice-loop.ts, not yet wired). Skeleton: it
// shows the design's voice orb in its idle/listening pulse without the
// real STT/LLM/TTS loop. Re-skinned to the dark oceanic check-in.
// Navigation (Skip → /session/reflection) is unchanged.

import { useEffect } from "react";
import { useRouter } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

import {
  Display,
  Pill,
  TopBar,
  WaveButton,
  WaveCard,
  WaveScreen,
} from "@/components/wave-ui";
import { WaveColors, WaveType } from "@/constants/wave-theme";

function VoiceOrb() {
  const ring = useSharedValue(0);
  const core = useSharedValue(0);

  useEffect(() => {
    ring.value = withRepeat(
      withTiming(1, { duration: 1600, easing: Easing.out(Easing.ease) }),
      -1,
    );
    core.value = withRepeat(
      withTiming(1, { duration: 2000, easing: Easing.inOut(Easing.sin) }),
      -1,
      true,
    );
  }, [ring, core]);

  const ringStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 0.9 + ring.value * 1.6 }],
    opacity: 0.9 - ring.value * 0.9,
  }));
  const coreStyle = useAnimatedStyle(() => ({
    opacity: 0.6 + core.value * 0.4,
    transform: [{ scale: 1 + core.value * 0.12 }],
  }));

  return (
    <View style={styles.orb}>
      <Animated.View style={[styles.orbRing, ringStyle]} />
      <Animated.View style={[styles.orbCore, coreStyle]} />
    </View>
  );
}

export default function CheckInScreenRoute() {
  const router = useRouter();

  return (
    <WaveScreen intensity={7}>
      <TopBar
        crumb="Check-in 1 of 5"
        trailing={<Pill>Voice · on-device</Pill>}
      />

      <Display size="lg" style={styles.centered}>
        Where is it{"\n"}now?
      </Display>

      <WaveCard style={styles.voiceCard}>
        <VoiceOrb />
        <Text style={styles.state}>listening</Text>
      </WaveCard>

      <View style={styles.readout}>
        <Text style={styles.readoutNum}>
          7<Text style={styles.readoutUnit}> /10</Text>
        </Text>
        <Text style={styles.readoutLbl}>strong</Text>
      </View>

      <Text style={styles.empty}>
        Whisper transcribes you, Kokoro replies in voice.{"\n"}Nothing leaves
        the phone.
      </Text>

      <WaveButton
        label="Skip check-in →"
        variant="ghost"
        onPress={() => router.push("/session/reflection")}
        style={styles.skip}
      />
    </WaveScreen>
  );
}

const styles = StyleSheet.create({
  centered: { textAlign: "center", marginTop: 8 },
  voiceCard: { alignItems: "center", gap: 12, marginTop: 8, paddingVertical: 22 },
  orb: {
    width: 80,
    height: 80,
    alignItems: "center",
    justifyContent: "center",
  },
  orbRing: {
    position: "absolute",
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 1,
    borderColor: WaveColors.waveGlow,
  },
  orbCore: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: WaveColors.waveGlow,
    shadowColor: WaveColors.waveGlow,
    shadowOpacity: 0.9,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 0 },
  },
  state: {
    fontFamily: WaveType.mono,
    fontSize: 9.5,
    letterSpacing: 3,
    textTransform: "uppercase",
    color: WaveColors.inkFaint,
  },
  readout: { alignItems: "center", marginTop: 18, gap: 4 },
  readoutNum: {
    fontFamily: WaveType.serif,
    fontStyle: "italic",
    fontSize: 56,
    lineHeight: 58,
    letterSpacing: -1.5,
    color: WaveColors.ink,
  },
  readoutUnit: { fontSize: 18, color: WaveColors.inkMute },
  readoutLbl: {
    fontFamily: WaveType.serif,
    fontStyle: "italic",
    fontSize: 15,
    color: WaveColors.inkSoft,
  },
  empty: {
    marginTop: 18,
    textAlign: "center",
    fontFamily: WaveType.serif,
    fontStyle: "italic",
    fontSize: 14,
    lineHeight: 21,
    color: WaveColors.inkMute,
  },
  skip: { alignSelf: "center", marginTop: 22 },
});
