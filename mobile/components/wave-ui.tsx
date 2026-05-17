/**
 * wave-ui — shared presentational primitives for the dark oceanic skin.
 *
 * Every screen composes these instead of hand-rolling StyleSheets, so the
 * Claude Design system (serif display copy, mono eyebrows, glassy cards,
 * glowing pill buttons) stays consistent. Nothing here owns app state.
 */

import { ReactNode } from "react";
import {
  Pressable,
  ScrollView,
  StyleProp,
  StyleSheet,
  Text,
  TextStyle,
  View,
  ViewStyle,
} from "react-native";

import { WaveBackground } from "@/components/wave-background";
import { WaveColors, WaveRadius, WaveSpacing, WaveType } from "@/constants/wave-theme";

/** Full-bleed screen: shared ocean behind a safe-area ScrollView. */
export function WaveScreen({
  children,
  intensity,
  contentStyle,
}: {
  children: ReactNode;
  intensity?: number;
  contentStyle?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={styles.screen}>
      <WaveBackground intensity={intensity} />
      <ScrollView
        style={styles.flex}
        contentContainerStyle={[styles.scrollContent, contentStyle]}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {children}
      </ScrollView>
    </View>
  );
}

export function Eyebrow({
  children,
  accent,
  style,
}: {
  children: ReactNode;
  accent?: boolean;
  style?: StyleProp<TextStyle>;
}) {
  return (
    <Text style={[styles.eyebrow, accent && styles.eyebrowAccent, style]}>
      {children}
    </Text>
  );
}

/** Emotional headline — serif italic, the voice of the product. */
export function Display({
  children,
  size = "md",
  style,
}: {
  children: ReactNode;
  size?: "sm" | "md" | "lg";
  style?: StyleProp<TextStyle>;
}) {
  return (
    <Text
      style={[
        styles.display,
        size === "sm" && styles.displaySm,
        size === "lg" && styles.displayLg,
        style,
      ]}
    >
      {children}
    </Text>
  );
}

export function Lede({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[styles.lede, style]}>{children}</Text>;
}

export function Hint({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[styles.hint, style]}>{children}</Text>;
}

export function WaveCard({
  children,
  accent,
  style,
}: {
  children: ReactNode;
  accent?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.card, accent && styles.cardAccent, style]}>{children}</View>
  );
}

export function Pill({ children }: { children: ReactNode }) {
  return (
    <View style={styles.pill}>
      <View style={styles.pillDot} />
      <Text style={styles.pillText}>{children}</Text>
    </View>
  );
}

type ButtonVariant = "primary" | "quiet" | "ghost";

export function WaveButton({
  label,
  onPress,
  variant = "primary",
  disabled,
  style,
}: {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.btn,
        variant === "quiet" && styles.btnQuiet,
        variant === "ghost" && styles.btnGhost,
        pressed && !disabled && styles.btnPressed,
        disabled && styles.btnDisabled,
        style,
      ]}
    >
      <Text
        style={[
          styles.btnLabel,
          variant === "ghost" && styles.btnGhostLabel,
          variant === "quiet" && styles.btnQuietLabel,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/** Selectable list chip (intake / safety / reflection option rows). */
export function Chip({
  label,
  selected,
  onPress,
  style,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      style={({ pressed }) => [
        styles.chip,
        (selected || pressed) && styles.chipActive,
        style,
      ]}
    >
      <Text style={[styles.chipText, selected && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

/** In-screen top bar: optional back, centered crumb, optional trailing slot. */
export function TopBar({
  crumb,
  onBack,
  backLabel = "← Back",
  trailing,
}: {
  crumb?: string;
  onBack?: () => void;
  backLabel?: string;
  trailing?: ReactNode;
}) {
  return (
    <View style={styles.topbar}>
      <View style={styles.topbarSide}>
        {onBack ? (
          <Pressable onPress={onBack} hitSlop={10}>
            <Text style={styles.backLink}>{backLabel}</Text>
          </Pressable>
        ) : null}
      </View>
      {crumb ? <Text style={styles.crumb}>{crumb}</Text> : <View style={styles.flex} />}
      <View style={[styles.topbarSide, styles.topbarTrailing]}>{trailing}</View>
    </View>
  );
}

export function StatBlock({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.statBlock}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  screen: { flex: 1, backgroundColor: WaveColors.bgDeep },
  scrollContent: {
    paddingHorizontal: WaveSpacing.screenX,
    paddingTop: 14,
    paddingBottom: 56,
    gap: WaveSpacing.gap,
  },

  eyebrow: {
    fontFamily: WaveType.mono,
    fontSize: 10,
    letterSpacing: 2,
    textTransform: "uppercase",
    color: WaveColors.inkFaint,
  },
  eyebrowAccent: { color: WaveColors.accent },

  display: {
    fontFamily: WaveType.serif,
    fontStyle: "italic",
    fontSize: 30,
    lineHeight: 35,
    letterSpacing: -0.4,
    color: WaveColors.ink,
  },
  displaySm: { fontSize: 23, lineHeight: 29 },
  displayLg: { fontSize: 40, lineHeight: 44, letterSpacing: -0.8 },

  lede: {
    fontFamily: WaveType.sans,
    fontSize: 14,
    lineHeight: 21,
    color: WaveColors.inkMute,
  },
  hint: {
    fontFamily: WaveType.mono,
    fontSize: 11.5,
    lineHeight: 17,
    letterSpacing: 0.4,
    color: WaveColors.inkFaint,
  },

  card: {
    backgroundColor: WaveColors.surface,
    borderWidth: 1,
    borderColor: WaveColors.border,
    borderRadius: WaveRadius.lg,
    borderCurve: "continuous",
    padding: 16,
    gap: 8,
  },
  cardAccent: {
    backgroundColor: "rgba(34, 211, 238, 0.09)",
    borderColor: "rgba(34, 211, 238, 0.28)",
  },

  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 5,
    paddingHorizontal: 11,
    borderRadius: WaveRadius.pill,
    backgroundColor: WaveColors.surface,
    borderWidth: 1,
    borderColor: WaveColors.border,
    alignSelf: "flex-start",
  },
  pillDot: {
    width: 5,
    height: 5,
    borderRadius: 5,
    backgroundColor: WaveColors.waveGlow,
  },
  pillText: {
    fontFamily: WaveType.mono,
    fontSize: 10,
    letterSpacing: 1.6,
    textTransform: "uppercase",
    color: WaveColors.inkMute,
  },

  btn: {
    alignSelf: "center",
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: WaveRadius.pill,
    backgroundColor: "rgba(232, 243, 252, 0.05)",
    borderWidth: 1,
    borderColor: WaveColors.borderGlow,
    alignItems: "center",
    justifyContent: "center",
  },
  btnPressed: {
    backgroundColor: "rgba(92, 225, 214, 0.10)",
    borderColor: WaveColors.waveGlow,
    transform: [{ scale: 0.985 }],
  },
  btnDisabled: { opacity: 0.32, borderColor: WaveColors.inkGhost },
  btnQuiet: { borderColor: WaveColors.inkGhost, backgroundColor: "transparent" },
  btnGhost: {
    borderColor: "transparent",
    backgroundColor: "transparent",
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  btnLabel: {
    fontFamily: WaveType.serif,
    fontStyle: "italic",
    fontSize: 18,
    color: WaveColors.ink,
  },
  btnQuietLabel: { color: WaveColors.inkMute },
  btnGhostLabel: {
    fontFamily: WaveType.mono,
    fontStyle: "normal",
    fontSize: 11,
    letterSpacing: 2,
    textTransform: "uppercase",
    color: WaveColors.inkMute,
  },

  chip: {
    backgroundColor: "rgba(232, 243, 252, 0.03)",
    borderWidth: 1,
    borderColor: WaveColors.border,
    borderRadius: 14,
    borderCurve: "continuous",
    paddingVertical: 13,
    paddingHorizontal: 15,
  },
  chipActive: {
    borderColor: WaveColors.chipActiveBorder,
    backgroundColor: WaveColors.chipActive,
  },
  chipText: {
    fontFamily: WaveType.sans,
    fontSize: 14,
    lineHeight: 19,
    color: WaveColors.inkSoft,
  },
  chipTextActive: { color: WaveColors.waveCrest },

  topbar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 32,
    gap: 8,
    paddingBottom: 4,
  },
  topbarSide: { minWidth: 64 },
  topbarTrailing: { alignItems: "flex-end" },
  backLink: {
    fontFamily: WaveType.mono,
    fontSize: 10,
    letterSpacing: 2,
    textTransform: "uppercase",
    color: WaveColors.inkFaint,
  },
  crumb: {
    flex: 1,
    textAlign: "center",
    fontFamily: WaveType.mono,
    fontSize: 10,
    letterSpacing: 2,
    textTransform: "uppercase",
    color: WaveColors.inkFaint,
  },

  statBlock: { alignItems: "center", gap: 6 },
  statValue: {
    fontFamily: WaveType.serif,
    fontStyle: "italic",
    fontSize: 36,
    letterSpacing: -0.6,
    color: WaveColors.waveCrest,
  },
  statLabel: {
    fontFamily: WaveType.mono,
    fontSize: 9,
    letterSpacing: 2,
    textTransform: "uppercase",
    color: WaveColors.inkFaint,
  },
});
