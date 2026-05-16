import { Stack } from "expo-router";

export default function SessionLayout() {
  return (
    <Stack screenOptions={{ headerStyle: { backgroundColor: "#08080C" }, headerTintColor: "#F1F1F4" }}>
      <Stack.Screen name="intake" options={{ title: "Intake" }} />
      <Stack.Screen name="safety" options={{ title: "Safety" }} />
      <Stack.Screen name="chunk" options={{ title: "Chunk" }} />
      <Stack.Screen name="checkin" options={{ title: "Check-in" }} />
      <Stack.Screen name="reflection" options={{ title: "Reflection" }} />
    </Stack>
  );
}
