import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Pressable,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { FileItem } from "../../src/api/client";
import * as storage from "../../src/services/storage";
import * as yt from "../../src/services/youtube";

export default function ViewFile() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [file, setFile] = useState<FileItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const files = await storage.getLocalFiles();
        const found = files.find((f) => f.id === id || f.externalId === id);
        setFile(found ?? null);
      } catch {
        /* ignore */
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const handleWatch = useCallback(async () => {
    if (!file?.externalId) return;
    try {
      await Linking.openURL(`https://youtu.be/${file.externalId}`);
    } catch {
      Alert.alert("Error", "Could not open video URL");
    }
  }, [file]);

  const handleShare = useCallback(async () => {
    if (!file?.externalId) return;
    try {
      await Share.share({
        message: `Watch my private video: https://youtu.be/${file.externalId}`,
        url: `https://youtu.be/${file.externalId}`,
      });
    } catch {
      /* ignore */
    }
  }, [file]);

  const handleDelete = useCallback(() => {
    if (!file) return;
    Alert.alert(
      "Delete Video",
      `Are you sure you want to remove "${file.originalName}" from CloudVault and YouTube?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            setDeleting(true);
            try {
              if (file.externalId) {
                await yt.deleteVideo(file.externalId, file.playlistItemId);
              }
              await storage.removeLocalFile(file.id);
              router.back();
            } catch (e: any) {
              Alert.alert("Delete Failed", e.message ?? "Could not delete video");
              setDeleting(false);
            }
          },
        },
      ]
    );
  }, [file, router]);

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#e5353b" />
      </View>
    );
  }

  if (!file) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorText}>Video not found</Text>
        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backButtonText}>Back to Library</Text>
        </Pressable>
      </View>
    );
  }

  const formattedDate = file.createdAt ? new Date(file.createdAt).toLocaleDateString() : "";
  const formattedSize = file.sizeBytes > 0 ? `${(file.sizeBytes / (1024 * 1024)).toFixed(1)} MB` : null;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="chevron-back" size={28} color="#fff" />
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {file.originalName}
        </Text>
      </View>

      <View style={styles.previewContainer}>
        {file.thumbnailUrl ? (
          <Image source={{ uri: file.thumbnailUrl }} style={styles.previewImage} resizeMode="cover" />
        ) : (
          <View style={styles.previewPlaceholder}>
            <Ionicons name="videocam-outline" size={64} color="#555" />
          </View>
        )}
        <Pressable style={styles.playOverlay} onPress={handleWatch}>
          <View style={styles.playCircle}>
            <Ionicons name="play" size={36} color="#fff" style={{ marginLeft: 3 }} />
          </View>
        </Pressable>
      </View>

      <View style={styles.content}>
        <Text style={styles.title}>{file.originalName}</Text>

        <View style={styles.metaRow}>
          <View style={styles.badge}>
            <Ionicons name="lock-closed" size={12} color="#4caf50" />
            <Text style={styles.badgeText}>Private on YouTube</Text>
          </View>
          {formattedSize ? <Text style={styles.metaSub}>{formattedSize}</Text> : null}
          {formattedDate ? <Text style={styles.metaSub}>{formattedDate}</Text> : null}
        </View>

        <View style={styles.actions}>
          <Pressable style={styles.primaryButton} onPress={handleWatch}>
            <Ionicons name="logo-youtube" size={20} color="#fff" />
            <Text style={styles.primaryButtonText}>Watch on YouTube</Text>
          </Pressable>

          <View style={styles.secondaryRow}>
            <Pressable style={styles.secondaryButton} onPress={handleShare}>
              <Ionicons name="share-social-outline" size={18} color="#fff" />
              <Text style={styles.secondaryButtonText}>Share Link</Text>
            </Pressable>

            <Pressable
              style={[styles.secondaryButton, styles.deleteButton]}
              onPress={handleDelete}
              disabled={deleting}
            >
              {deleting ? (
                <ActivityIndicator size="small" color="#e5353b" />
              ) : (
                <>
                  <Ionicons name="trash-outline" size={18} color="#e5353b" />
                  <Text style={styles.deleteButtonText}>Delete</Text>
                </>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0b0b0f" },
  centerContainer: { flex: 1, backgroundColor: "#0b0b0f", justifyContent: "center", alignItems: "center" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingTop: 54,
    paddingHorizontal: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#1a1a22",
  },
  headerTitle: { color: "#fff", fontSize: 16, fontWeight: "600", flex: 1 },
  previewContainer: {
    width: "100%",
    aspectRatio: 16 / 9,
    backgroundColor: "#16161e",
    position: "relative",
    justifyContent: "center",
    alignItems: "center",
  },
  previewImage: { width: "100%", height: "100%" },
  previewPlaceholder: { flex: 1, justifyContent: "center", alignItems: "center" },
  playOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.3)",
  },
  playCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: "rgba(229, 53, 59, 0.9)",
    justifyContent: "center",
    alignItems: "center",
  },
  content: { padding: 20, flex: 1 },
  title: { color: "#fff", fontSize: 20, fontWeight: "700", marginBottom: 12 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 28 },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(76, 175, 80, 0.15)",
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 12,
  },
  badgeText: { color: "#4caf50", fontSize: 12, fontWeight: "600" },
  metaSub: { color: "#888", fontSize: 13 },
  actions: { marginTop: "auto", gap: 12, paddingBottom: 20 },
  primaryButton: {
    backgroundColor: "#e5353b",
    borderRadius: 12,
    paddingVertical: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  primaryButtonText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  secondaryRow: { flexDirection: "row", gap: 12 },
  secondaryButton: {
    flex: 1,
    backgroundColor: "#1a1a22",
    borderRadius: 12,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  secondaryButtonText: { color: "#fff", fontSize: 14, fontWeight: "600" },
  deleteButton: { borderWidth: 1, borderColor: "rgba(229, 53, 59, 0.4)", backgroundColor: "transparent" },
  deleteButtonText: { color: "#e5353b", fontSize: 14, fontWeight: "600" },
  errorText: { color: "#fff", fontSize: 16, marginBottom: 16 },
  backButton: { backgroundColor: "#1a1a22", paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8 },
  backButtonText: { color: "#e5353b", fontWeight: "600" },
});
