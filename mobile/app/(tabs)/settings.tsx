import { useEffect, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "../../src/context/AuthContext";
import { api } from "../../src/api/client";
import {
  ensureMediaPermission,
  isAutoSyncEnabled,
  setAutoSyncEnabled,
} from "../../src/services/autosync";

export default function Settings() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const [connected, setConnected] = useState<boolean | null>(null);
  const [autoSync, setAutoSync] = useState(false);

  useEffect(() => {
    api.youtubeStatus().then((res) => setConnected(res.connected)).catch(() => setConnected(false));
    isAutoSyncEnabled().then(setAutoSync).catch(() => {});
  }, []);

  const toggleAutoSync = async () => {
    try {
      if (!autoSync) {
        const granted = await ensureMediaPermission();
        if (!granted) {
          Alert.alert("Permission needed", "Allow photo/video access to auto-upload new camera files.");
          return;
        }
      }
      const next = !autoSync;
      await setAutoSyncEnabled(next);
      setAutoSync(next);
    } catch (e: any) {
      Alert.alert("Auto-upload error", String(e?.message ?? e));
    }
  };

  useEffect(() => {
    api.youtubeStatus().then((res) => setConnected(res.connected)).catch(() => setConnected(false));
  }, []);

  const connectYoutube = async () => {
    try {
      const { authUrl } = await api.youtubeAuthUrl();
      if (authUrl) {
        Alert.alert(
          "Connect YouTube",
          "Open this URL in a browser, sign in, and paste the code back here:\n\n" + authUrl
        );
      }
    } catch (e: any) {
      Alert.alert("Error", e.message);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.email}>{user?.email}</Text>

      <View style={styles.row}>
        <Text style={styles.label}>YouTube</Text>
        <Text style={connected === false ? styles.notConnected : styles.connected}>
          {connected === true ? "Connected" : connected === false ? "Not connected" : "..."}
        </Text>
      </View>

      <Pressable style={styles.button} onPress={connectYoutube}>
        <Text style={styles.buttonText}>Connect YouTube</Text>
      </Pressable>

      <View style={styles.row}>
        <View style={{ flex: 1, paddingRight: 12 }}>
          <Text style={styles.label}>Auto-upload camera files</Text>
          <Text style={styles.hint}>Uploads new photos/videos while the app is open.</Text>
        </View>
        <Pressable
          style={[styles.toggle, autoSync && styles.toggleOn]}
          onPress={toggleAutoSync}
        >
          <Text style={styles.toggleText}>{autoSync ? "ON" : "OFF"}</Text>
        </Pressable>
      </View>

      <Pressable style={[styles.button, styles.logout]} onPress={async () => { await logout(); router.replace("/login"); }}>
        <Text style={styles.logoutText}>Log Out</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0b0b0f", padding: 24, paddingTop: 60 },
  email: { color: "#fff", fontSize: 20, fontWeight: "700", marginBottom: 24 },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#1a1a22",
    marginBottom: 16,
  },
  label: { color: "#fff", fontSize: 16 },
  connected: { color: "#4caf50", fontSize: 16 },
  notConnected: { color: "#888", fontSize: 16 },
  button: {
    backgroundColor: "#1a1a22",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    marginBottom: 12,
  },
  buttonText: { color: "#fff", fontWeight: "600", fontSize: 15 },
  hint: { color: "#888", fontSize: 12, marginTop: 4 },
  toggle: {
    backgroundColor: "#1a1a22",
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 16,
    alignSelf: "center",
  },
  toggleOn: { backgroundColor: "#e5353b" },
  toggleText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  logout: { backgroundColor: "transparent", borderWidth: 1, borderColor: "#e5353b" },
  logoutText: { color: "#e5353b", fontWeight: "600", fontSize: 15 },
});
