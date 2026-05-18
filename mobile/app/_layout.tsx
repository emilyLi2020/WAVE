import { DarkTheme, ThemeProvider } from "@react-navigation/native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import "react-native-reanimated";

// The oceanic skin is dark-first and full-bleed: every screen draws its
// own in-screen top bar over the shared wave, so the stack chrome is
// hidden throughout. Home is the landing page; the dev menu is a
// right-edge swipe drawer rendered inside it. GestureHandlerRootView
// wraps the app so that drawer's pan gestures work.
export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider value={DarkTheme}>
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: "#02060d" },
          }}
        >
          <Stack.Screen name="index" />
          <Stack.Screen name="tests" />
          <Stack.Screen name="session" />
          <Stack.Screen name="onboarding" />
          <Stack.Screen name="dashboard" />
          <Stack.Screen name="history" />
          <Stack.Screen name="insights" />
        </Stack>
        <StatusBar style="light" />
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
