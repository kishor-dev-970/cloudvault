import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "../../src/context/AuthContext";
import { isConnected } from "../../src/services/youtube";
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
    isConnected().then(setConnected).catch(() => setConnected(false));
    isAutoSyncEnabled().then(setAutoSync).catch(() => {});
  }, []);

  const toggleAutoSync = async () => {
    const next = !autoSync;
    if (next) {
      const granted = await ensureMediaPermission();
      if (!granted) return;
    }
    await setAutoSyncEnabled(next);
    setAutoSync(next);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.email}>{user?.email ?? "YouTube User"}</Text>

      <View style={styles.row}>
        <Text style={styles.label}>YouTube</Text>
        <Text style={connected ? styles.connected : styles.notConnected}>
          {connected ? "Connected" : "Not connected"}
        </Text>
      </View>

      <View style={styles.row}>
        <View style={{ flex: 1, paddingRight: 12 }}>
          <Text style={styles.label}>Auto-upload camera files</Text>
          <Text style={styles.hint}>Uploads new videos while the app is open.</Text>
        </View>
        <Pressable style={[styles.toggle, autoSync && styles.toggleOn]} onPress={toggleAutoSync}>
          <Text style={styles.toggleText}>{autoSync ? "ON" : "OFF"}</Text>
        </Pressable>
      </View>

      <Pressable
        style={[styles.button, styles.logout]}
        onPress={async () => {
          await logout();
          router.replace("/login");
        }}
      >
        <Text style={styles.logoutText}>Disconnect YouTube</Text>
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
