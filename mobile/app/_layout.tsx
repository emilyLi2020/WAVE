import { DarkTheme, ThemeProvider } from "@react-navigation/native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import "react-native-reanimated";

// The oceanic skin is dark-first and full-bleed: each ported page draws
// its own in-screen top bar over the shared wave, so the stack chrome is
// hidden for them. The dev menu keeps its header.
export default function RootLayout() {
  return (
    <ThemeProvider value={DarkTheme}>
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: "#02060d" },
          headerTintColor: "#f4faff",
          contentStyle: { backgroundColor: "#02060d" },
        }}
      >
        <Stack.Screen name="index" options={{ title: "Wave dev" }} />
        <Stack.Screen name="tests" options={{ headerShown: false }} />
        <Stack.Screen name="session" options={{ headerShown: false }} />
        <Stack.Screen name="onboarding" options={{ headerShown: false }} />
        <Stack.Screen name="dashboard" options={{ headerShown: false }} />
        <Stack.Screen name="history" options={{ headerShown: false }} />
        <Stack.Screen name="insights" options={{ headerShown: false }} />
      </Stack>
      <StatusBar style="light" />
    </ThemeProvider>
  );
}
