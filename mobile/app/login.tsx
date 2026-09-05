import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from "react-native";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { useRouter } from "expo-router";
import { useAuth } from "../src/context/AuthContext";
import { getRedirectUri } from "../src/services/youtube";

export default function Login() {
  const { user, connectYouTube, completeOAuth, loading } = useAuth();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const processed = useRef(false);

  const handleOAuthUrl = useCallback(
    async (rawUrl: string) => {
      if (processed.current) return;
      processed.current = true;
      try {
        const url = new URL(rawUrl);
        const error = url.searchParams.get("error");
        const code = url.searchParams.get("code");

        if (error) {
          Alert.alert("OAuth Error", error);
          return;
        }

        if (code) {
          try {
            const SecureStore = await import("expo-secure-store");
            const verifier = await SecureStore.getItemAsync("cv_oauth_verifier");
            if (verifier) {
              await completeOAuth(code, verifier);
              await SecureStore.deleteItemAsync("cv_oauth_verifier");
              router.replace("/(tabs)/library");
            }
          } catch (e: any) {
            Alert.alert("Connection failed", e.message ?? "Could not complete YouTube sign-in");
          }
        }
      } finally {
        setBusy(false);
      }
    },
    [completeOAuth, router]
  );

  useEffect(() => {
    const sub = Linking.addEventListener("url", (event) => {
      handleOAuthUrl(event.url);
    });
    return () => sub.remove();
  }, [handleOAuthUrl]);

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#e5353b" />
      </View>
    );
  }

  if (user) {
    router.replace("/(tabs)/library");
    return null;
  }

  const handleConnect = async () => {
    setBusy(true);
    processed.current = false;
    try {
      const { url, codeVerifier } = await connectYouTube();
      // Store codeVerifier for later
      await import("expo-secure-store").then((s) =>
        s.setItemAsync("cv_oauth_verifier", codeVerifier)
      );
      // Launch in a Chrome Custom Tab and await the deep-link result.
      // (Google policy rejects custom-scheme OAuth when opened in a loose
      // system browser like Samsung Internet.)
      const result = await WebBrowser.openAuthSessionAsync(url, getRedirectUri());
      if (result.type === "success" && result.url) {
        await handleOAuthUrl(result.url);
      } else {
        setBusy(false);
        processed.current = false;
      }
    } catch (e: any) {
      Alert.alert("Error", e.message ?? "Could not start YouTube connection");
      setBusy(false);
      processed.current = false;
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.logo}>CloudVault</Text>
        <Text style={styles.subtitle}>
          Private video storage in your own YouTube account
        </Text>

        <Pressable
          style={[styles.button, busy && styles.disabled]}
          onPress={handleConnect}
          disabled={busy}
        >
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Connect YouTube</Text>
          )}
        </Pressable>

        <Text style={styles.hint}>
          Sign in with your Google account to start uploading videos directly
          to your private YouTube channel.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0b0b0f", justifyContent: "center", padding: 24 },
  card: { width: "100%" },
  logo: { color: "#fff", fontSize: 34, fontWeight: "800", marginBottom: 4 },
  subtitle: { color: "#9a9aa5", fontSize: 14, marginBottom: 32 },
  button: {
    backgroundColor: "#e5353b",
    borderRadius: 12,
    padding: 18,
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
    gap: 10,
  },
  disabled: { opacity: 0.6 },
  buttonText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  hint: { color: "#9a9aa5", fontSize: 13, marginTop: 24, textAlign: "center", lineHeight: 20 },
});
