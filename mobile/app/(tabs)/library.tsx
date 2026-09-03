import { useCallback, useEffect, useState } from "react";
import { FlatList, Image, Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { api, type FileItem } from "../../src/api/client";
import { isAutoSyncEnabled, syncNewMedia } from "../../src/services/autosync";
import { useFocusEffect } from "expo-router";

export default function Library() {
  const [files, setFiles] = useState<FileItem[]>([]);

  const openVideo = useCallback(async (item: FileItem) => {
    try {
      if (item.externalId) {
        // Deep-link into the YouTube app (or browser) instead of in-app playback.
        await Linking.openURL(`https://youtu.be/${item.externalId}`);
      }
    } catch {
      /* ignore */
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        try {
          const res = await api.listFiles();
          if (!cancelled) setFiles(res.files);
        } catch {
          /* ignore */
        }
        // Foreground auto-sync: upload new camera files while the app is open.
        try {
          if (await isAutoSyncEnabled()) {
            const r = await syncNewMedia();
            if (!cancelled && r.uploaded > 0) {
              const res2 = await api.listFiles();
              if (!cancelled) setFiles(res2.files);
            }
          }
        } catch {
          /* ignore */
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [])
  );

  return (
    <View style={styles.container}>
      <FlatList
        data={files}
        numColumns={3}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 2 }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>No uploads yet</Text>
            <Text style={styles.emptySub}>Tap Upload to add your first file</Text>
          </View>
        }
        renderItem={({ item }) => (
          <Pressable
            style={styles.cell}
            onPress={() => openVideo(item)}
          >
            {/* Placeholder always rendered underneath; if YouTube hasn't generated
                a thumbnail (404 for new private uploads) the Image draws nothing
                and this fallback stays visible. */}
            <View style={styles.placeholder}>
              <Ionicons name="play-circle" size={44} color="#e5353b" />
              <Text style={styles.placeholderName} numberOfLines={2}>
                {item.originalName}
              </Text>
            </View>
            {item.thumbnailUrl ? (
              <Image source={{ uri: item.thumbnailUrl }} style={styles.thumbOverlay} />
            ) : null}
            {item.status === "failed" && <Text style={styles.failed}>failed</Text>}
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0b0b0f" },
  cell: { flex: 1 / 3, aspectRatio: 1, padding: 2 },
  thumbOverlay: {
    position: "absolute",
    top: 2,
    left: 2,
    right: 2,
    bottom: 2,
    borderRadius: 8,
  },
  placeholder: {
    flex: 1,
    borderRadius: 8,
    backgroundColor: "#1a1a22",
    alignItems: "center",
    justifyContent: "center",
    padding: 6,
  },
  placeholderName: { color: "#888", fontSize: 11, marginTop: 6, textAlign: "center" },
  failed: {
    position: "absolute",
    bottom: 4,
    left: 4,
    color: "#ff5c5c",
    fontSize: 11,
    backgroundColor: "rgba(0,0,0,0.6)",
    borderRadius: 4,
    paddingHorizontal: 4,
    overflow: "hidden",
  },
  empty: { alignItems: "center", justifyContent: "center", paddingTop: 120 },
  emptyTitle: { color: "#fff", fontSize: 20, fontWeight: "700" },
  emptySub: { color: "#888", fontSize: 14, marginTop: 8 },
});
