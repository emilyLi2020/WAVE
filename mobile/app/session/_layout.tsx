import { Stack } from "expo-router";

// Session screens are full-bleed over the shared ocean and carry their
// own in-screen top bars, so the stack header is hidden throughout.
// The flow is a continuous phase machine, not a nav stack — the default
// iOS push-slide between routes (intake→safety→chunk→…) reads as
// "swiping pages" and breaks the single-surface feel. A short cross-fade
// over the shared ocean matches the prototype's phase transitions.
export default function SessionLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: "#02060d" },
        animation: "fade",
        animationDuration: 220,
        gestureEnabled: false,
      }}
    >
      <Stack.Screen name="intake" />
      <Stack.Screen name="safety" />
      <Stack.Screen name="chunk" />
      <Stack.Screen name="checkin" />
      <Stack.Screen name="reflection" />
    </Stack>
  );
}
