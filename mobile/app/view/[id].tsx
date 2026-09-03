import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useVideoPlayer, VideoView } from "expo-video";
import { api, type FileItem } from "../../src/api/client";
import { Ionicons } from "@expo/vector-icons";

export default function ViewFile() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [file, setFile] = useState<FileItem | null>(null);
  const [streamUrl, setStreamUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.listFiles()
      .then((res) => {
        const found = res.files.find((f) => f.id === id);
        setFile(found ?? null);
      })
      .catch(() => {});

    api
      .getStreamUrl(id)
      .then((res) => setStreamUrl(res.url))
      .catch((e) => setError(e.message ?? "Could not load video"));
  }, [id]);

  const player = useVideoPlayer(streamUrl, (player) => {
    player.loop = true;
    player.play();
  });

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={28} color="#fff" />
        </Pressable>
        <Text style={styles.title} numberOfLines={1}>
          {file?.originalName ?? "Loading..."}
        </Text>
      </View>

      {streamUrl && !error ? (
        <VideoView
          player={player}
          style={styles.video}
          contentFit="contain"
          nativeControls
        />
      ) : (
        <View style={styles.placeholder}>
          {error ? (
            <Text style={styles.errorText}>{error}</Text>
          ) : (
            <Text style={styles.placeholderText}>Loading stream...</Text>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 16,
    backgroundColor: "#0b0b0f",
  },
  title: { color: "#fff", fontSize: 16, fontWeight: "600", flex: 1 },
  video: { flex: 1, width: "100%" },
  placeholder: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0b0b0f",
    padding: 24,
  },
  placeholderText: { color: "#888" },
  errorText: { color: "#ff5c5c", textAlign: "center", fontSize: 14 },
});
