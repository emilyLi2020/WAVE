import { Stack } from "expo-router";

// Session screens are full-bleed over the shared ocean and carry their
// own in-screen top bars, so the stack header is hidden throughout.
export default function SessionLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: "#02060d" },
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
