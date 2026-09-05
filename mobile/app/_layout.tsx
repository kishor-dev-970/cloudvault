import { useEffect } from "react";
import { AppState } from "react-native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { AuthProvider } from "../src/context/AuthContext";
import { syncNewMedia } from "../src/services/autosync";

export default function RootLayout() {
  // Trigger autosync on first launch and whenever the app returns to the foreground.
  useEffect(() => {
    syncNewMedia().catch(() => {});
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") syncNewMedia().catch(() => {});
    });
    return () => sub.remove();
  }, []);

  return (
    <AuthProvider>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="login" />
        <Stack.Screen name="(tabs)" />
      </Stack>
    </AuthProvider>
  );
}