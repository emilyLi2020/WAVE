// Onboarding — RN port of client/app/onboarding/page.tsx. Three
// optional questions: first name, MAT type, usual dose time, plus a
// consent checkbox. The web version is uncontrolled and just hands
// off to /session on submit; this mirrors that behaviour with local
// state and routes to /session/intake. Persistence into a real
// PatientProfile is out of scope here — that will land alongside the
// session reducer wiring on the intake screen.
//
// Re-skinned in the dark oceanic visual system. Logic, state, and the
// /session/intake handoff are unchanged.

import { useState } from "react";
import { Link, useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import {
  Chip,
  Display,
  Eyebrow,
  Hint,
  Lede,
  TopBar,
  WaveButton,
  WaveCard,
  WaveScreen,
} from "@/components/wave-ui";
import { WaveColors, WaveType } from "@/constants/wave-theme";

const MAT_OPTIONS = [
  "Buprenorphine / Suboxone",
  "Naltrexone (oral)",
  "Vivitrol (injection)",
  "Methadone",
  "Not on MAT",
  "Prefer not to say",
];

export default function OnboardingScreen() {
  const router = useRouter();
  const [firstName, setFirstName] = useState("");
  const [matType, setMatType] = useState<string | null>(null);
  const [doseTime, setDoseTime] = useState("08:00");
  const [consent, setConsent] = useState(false);

  function handleContinue() {
    // Future: persist {firstName, matType, doseTime} into the patient
    // profile slice before routing.
    router.push("/session/intake");
  }

  return (
    <WaveScreen>
      <TopBar crumb="Setup" />

      <Eyebrow accent>Welcome</Eyebrow>
      <Display>Let&apos;s set up{"\n"}your WAVE.</Display>
      <Lede>
        Three quiet questions. Everything stays on your device. You can skip
        any of them.
      </Lede>

      <View style={styles.field}>
        <Eyebrow>What should WAVE call you?</Eyebrow>
        <TextInput
          value={firstName}
          onChangeText={setFirstName}
          placeholder="First name or nickname"
          placeholderTextColor={WaveColors.inkFaint}
          autoCapitalize="words"
          style={styles.input}
        />
      </View>

      <View style={styles.field}>
        <Eyebrow>Are you on Medication-Assisted Treatment?</Eyebrow>
        <View style={styles.optionGrid}>
          {MAT_OPTIONS.map((option) => (
            <Chip
              key={option}
              label={option}
              selected={matType === option}
              onPress={() => setMatType(option)}
            />
          ))}
        </View>
      </View>

      <View style={styles.field}>
        <Eyebrow>When do you usually take your dose?</Eyebrow>
        <TextInput
          value={doseTime}
          onChangeText={setDoseTime}
          placeholder="HH:MM"
          placeholderTextColor={WaveColors.inkFaint}
          keyboardType="numbers-and-punctuation"
          maxLength={5}
          style={[styles.input, styles.inputTime]}
        />
        <Hint>Helps WAVE spot missed-dose patterns. Best guess is fine.</Hint>
      </View>

      <Pressable
        onPress={() => setConsent((c) => !c)}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: consent }}
      >
        <WaveCard accent={consent} style={styles.consentPanel}>
          <View style={[styles.checkbox, consent && styles.checkboxChecked]}>
            {consent ? <Text style={styles.checkboxMark}>✓</Text> : null}
          </View>
          <Text style={styles.consentText}>
            I understand WAVE is a support tool, not a substitute for a
            counselor, prescriber, or crisis line. If I am in crisis I will
            call or text 988, or call 1-800-662-HELP (SAMHSA National
            Helpline).
          </Text>
        </WaveCard>
      </Pressable>

      <View style={styles.footer}>
        <Link href="/" asChild>
          <Pressable hitSlop={8}>
            <Text style={styles.footerLink}>← Dev menu</Text>
          </Pressable>
        </Link>
        <WaveButton
          label="continue"
          onPress={handleContinue}
          disabled={!consent}
          style={styles.cta}
        />
      </View>
    </WaveScreen>
  );
}

const styles = StyleSheet.create({
  field: { gap: 8, marginTop: 4 },
  input: {
    backgroundColor: WaveColors.surface,
    borderColor: WaveColors.border,
    borderWidth: 1,
    borderRadius: 14,
    borderCurve: "continuous",
    paddingHorizontal: 14,
    paddingVertical: 13,
    color: WaveColors.ink,
    fontSize: 15,
    fontFamily: WaveType.sans,
  },
  inputTime: { alignSelf: "flex-start", minWidth: 130 },
  optionGrid: { gap: 6 },
  consentPanel: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: WaveColors.borderGlow,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
  checkboxChecked: {
    backgroundColor: WaveColors.waveGlow,
    borderColor: WaveColors.waveGlow,
  },
  checkboxMark: { color: WaveColors.bgDeep, fontSize: 12, fontWeight: "700" },
  consentText: {
    color: WaveColors.inkMute,
    fontSize: 12.5,
    lineHeight: 19,
    flex: 1,
    fontFamily: WaveType.sans,
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 12,
    gap: 8,
  },
  footerLink: {
    color: WaveColors.inkFaint,
    fontSize: 11,
    letterSpacing: 1.4,
    textTransform: "uppercase",
    fontFamily: WaveType.mono,
  },
  cta: { alignSelf: "flex-end", marginRight: 0 },
});
