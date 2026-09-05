import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from "react-native";
import * as SecureStore from "expo-secure-store";
import { Ionicons } from "@expo/vector-icons";
import { FileItem } from "../../src/api/client";

const FILES_KEY = "cloudvault_files";

export default function ViewFile() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const openVideo = useCallback(async () => {
    setLoading(true);
    try {
      const raw = await SecureStore.getItemAsync(FILES_KEY);
      const files: FileItem[] = raw ? JSON.parse(raw) : [];
      const file = files.find((f) => f.id === id);
      if (file?.externalId) {
        await Linking.openURL(`https://youtu.be/${file.externalId}`);
      }
    } catch {}
    setLoading(false);
  }, [id]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={28} color="#fff" />
        </Pressable>
        <Text style={styles.title} numberOfLines={1}>Video</Text>
      </View>
      <View style={styles.center}>
        {loading ? (
          <ActivityIndicator color="#e5353b" />
        ) : (
          <Pressable style={styles.playBtn} onPress={openVideo}>
            <Ionicons name="play" size={48} color="#fff" />
            <Text style={styles.playText}>Open in YouTube</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0b0b0f" },
  header: { flexDirection: "row", alignItems: "center", gap: 12, padding: 16 },
  title: { color: "#fff", fontSize: 16, fontWeight: "600", flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  playBtn: { alignItems: "center", gap: 12 },
  playText: { color: "#9a9aa5", fontSize: 14 },
});
