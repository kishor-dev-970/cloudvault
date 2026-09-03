import { useState, useEffect, useRef } from "react";
import { AppState, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import * as Linking from "expo-linking";
import { useRouter } from "expo-router";
import { useAuth } from "../src/context/AuthContext";
import { api } from "../src/api/client";

export default function Login() {
  const { login, signup, user, completeGoogleSignIn } = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (user) router.replace("/(tabs)/library");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // When the OAuth browser returns, the app foregrounds again; pick up the server-side
  // pending session so sign-in completes even though Expo Go strips deep-link payloads.
  useEffect(() => {
    if (user) return;
    const check = async () => {
      try {
        const session = await api.pendingGoogleSession();
        if (session?.token && session.email) await completeGoogleSignIn(session.token, session.email);
      } catch {
        /* no pending session */
      }
    };
    check();
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") check();
    });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const submit = async () => {
    setError("");
    setBusy(true);
    try {
      if (mode === "login") await login(email, password);
      else await signup(email, password);
    } catch (e: any) {
      setError(e.message ?? "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  const googleLogin = async () => {
    setError("");
    setBusy(true);
    try {
      const { authUrl } = await api.googleAuthUrl();
      await Linking.openURL(authUrl);
    } catch (e: any) {
      setError(e.message ?? "Could not open Google login");
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={styles.container}
    >
      <View style={styles.card}>
        <Text style={styles.logo}>CloudVault</Text>
        <Text style={styles.subtitle}>
          Private media stored in your own YouTube account
        </Text>

        <TextInput
          style={styles.input}
          placeholder="Email"
          placeholderTextColor="#888"
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
        />
        <TextInput
          style={styles.input}
          placeholder="Password"
          placeholderTextColor="#888"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
        />

        {!!error && <Text style={styles.error}>{error}</Text>}

        <Pressable style={[styles.googleButton, busy && styles.disabled]} onPress={googleLogin} disabled={busy}>
          <Text style={styles.googleButtonText}>Continue with Google</Text>
        </Pressable>

        <View style={styles.dividerRow}>
          <View style={styles.divider} />
          <Text style={styles.dividerText}>or</Text>
          <View style={styles.divider} />
        </View>

        <Pressable style={[styles.button, busy && styles.disabled]} onPress={submit} disabled={busy}>
          <Text style={styles.buttonText}>
            {mode === "login" ? "Log In" : "Create Account"}
          </Text>
        </Pressable>

        <Pressable onPress={() => setMode(mode === "login" ? "signup" : "login")}>
          <Text style={styles.switch}>
            {mode === "login"
              ? "Don't have an account? Sign up"
              : "Already have an account? Log in"}
          </Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0b0b0f", justifyContent: "center", padding: 24 },
  card: { width: "100%" },
  logo: { color: "#fff", fontSize: 34, fontWeight: "800", marginBottom: 4 },
  subtitle: { color: "#9a9aa5", fontSize: 14, marginBottom: 32 },
  input: {
    backgroundColor: "#1a1a22",
    borderRadius: 12,
    padding: 14,
    color: "#fff",
    fontSize: 15,
    marginBottom: 12,
  },
  error: { color: "#ff5c5c", marginBottom: 12, fontSize: 13 },
  googleButton: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    marginBottom: 16,
    flexDirection: "row",
    justifyContent: "center",
  },
  googleButtonText: { color: "#111", fontWeight: "700", fontSize: 16 },
  dividerRow: { flexDirection: "row", alignItems: "center", marginBottom: 16 },
  divider: { flex: 1, height: 1, backgroundColor: "#2a2a33" },
  dividerText: { color: "#777", marginHorizontal: 12, fontSize: 12 },
  button: {
    backgroundColor: "#e5353b",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    marginTop: 4,
  },
  disabled: { opacity: 0.6 },
  buttonText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  switch: { color: "#e5353b", textAlign: "center", marginTop: 20, fontSize: 14 },
});
