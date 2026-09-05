import { useCallback, useState } from "react";
import { FlatList, Image, Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { FileItem } from "../../src/api/client";
import { useFocusEffect } from "expo-router";
import * as SecureStore from "expo-secure-store";

const FILES_KEY = "cloudvault_files";

async function getLocalFiles(): Promise<FileItem[]> {
  const raw = await SecureStore.getItemAsync(FILES_KEY);
  return raw ? JSON.parse(raw) : [];
}

export default function Library() {
  const [files, setFiles] = useState<FileItem[]>([]);

  const openVideo = useCallback(async (item: FileItem) => {
    try {
      if (item.externalId) {
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
          const localFiles = await getLocalFiles();
          if (!cancelled) setFiles(localFiles);
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
            <Text style={styles.emptySub}>Tap Upload to add your first video</Text>
          </View>
        }
        renderItem={({ item }) => (
          <Pressable
            style={styles.cell}
            onPress={() => openVideo(item)}
          >
            <View style={styles.placeholder}>
              <Ionicons name="play-circle" size={44} color="#e5353b" />
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
  empty: { alignItems: "center", justifyContent: "center", paddingTop: 120 },
  emptyTitle: { color: "#fff", fontSize: 20, fontWeight: "700" },
  emptySub: { color: "#888", fontSize: 14, marginTop: 8 },
});
