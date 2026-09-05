import { useCallback, useState } from "react";
import {
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { FileItem } from "../../src/api/client";
import { useFocusEffect, useRouter } from "expo-router";
import * as storage from "../../src/services/storage";
import * as yt from "../../src/services/youtube";

export default function Library() {
  const router = useRouter();
  const [files, setFiles] = useState<FileItem[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const loadLocalFiles = useCallback(async () => {
    try {
      const local = await storage.getLocalFiles();
      setFiles(local);
      return local;
    } catch {
      return [];
    }
  }, []);

  const syncWithYouTube = useCallback(async () => {
    try {
      const connected = await yt.isConnected();
      if (!connected) return;

      const remoteVideos = await yt.fetchPlaylistVideos();
      const localFiles = await storage.getLocalFiles();

      // Merge remote playlist items into local library
      const localMap = new Map(localFiles.map((f) => [f.externalId || f.id, f]));
      const merged: FileItem[] = [];

      for (const remote of remoteVideos) {
        const id = remote.externalId || remote.id;
        const existing = localMap.get(id);
        if (existing) {
          // Keep local properties (like local high-res thumbnail and original size)
          merged.push({
            ...remote,
            ...existing,
            playlistItemId: remote.playlistItemId || existing.playlistItemId,
            thumbnailUrl: existing.thumbnailUrl || remote.thumbnailUrl,
          });
          localMap.delete(id);
        } else {
          merged.push(remote);
        }
      }

      // Add any remaining local items that haven't synced to playlist
      for (const remaining of localMap.values()) {
        merged.push(remaining);
      }

      // Sort by creation date descending
      merged.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      await storage.saveLocalFiles(merged);
      setFiles(merged);
    } catch (err) {
      console.warn("YouTube playlist sync failed:", err);
    }
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadLocalFiles();
    await syncWithYouTube();
    setRefreshing(false);
  }, [loadLocalFiles, syncWithYouTube]);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        const local = await loadLocalFiles();
        if (active && local.length === 0) {
          // If empty, try fetching from YouTube once
          await syncWithYouTube();
        }
      })();
      return () => {
        active = false;
      };
    }, [loadLocalFiles, syncWithYouTube])
  );

  const handleOpenDetail = useCallback(
    (item: FileItem) => {
      router.push({ pathname: "/view/[id]", params: { id: item.id } });
    },
    [router]
  );

  return (
    <View style={styles.container}>
      <FlatList
        data={files}
        numColumns={3}
        keyExtractor={(item) => item.id}
        contentContainerStyle={files.length === 0 ? styles.emptyContainer : styles.gridContainer}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#e5353b"
            colors={["#e5353b"]}
          />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="cloud-offline-outline" size={56} color="#444" />
            <Text style={styles.emptyTitle}>No uploads yet</Text>
            <Text style={styles.emptySub}>
              Pull down to sync with YouTube, or tap Upload to add a video.
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <Pressable style={styles.cell} onPress={() => handleOpenDetail(item)}>
            <View style={styles.placeholder}>
              <Ionicons name="play-circle" size={38} color="#e5353b" />
              <Text style={styles.placeholderName} numberOfLines={2}>
                {item.originalName}
              </Text>
            </View>
            {item.thumbnailUrl ? (
              <Image source={{ uri: item.thumbnailUrl }} style={styles.thumbOverlay} />
            ) : null}
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0b0b0f" },
  gridContainer: { padding: 4 },
  emptyContainer: { flex: 1, justifyContent: "center", alignItems: "center" },
  cell: { flex: 1 / 3, aspectRatio: 1, padding: 3 },
  thumbOverlay: {
    position: "absolute",
    top: 3,
    left: 3,
    right: 3,
    bottom: 3,
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
  placeholderName: { color: "#888", fontSize: 11, marginTop: 4, textAlign: "center" },
  empty: { alignItems: "center", justifyContent: "center", paddingHorizontal: 32 },
  emptyTitle: { color: "#fff", fontSize: 18, fontWeight: "700", marginTop: 16 },
  emptySub: { color: "#888", fontSize: 13, marginTop: 8, textAlign: "center", lineHeight: 18 },
});
