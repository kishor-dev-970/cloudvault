import { useState } from "react";
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import { useRouter } from "expo-router";
import * as yt from "../../src/services/youtube";
import * as storage from "../../src/services/storage";
import { FileItem } from "../../src/api/client";

export default function Upload() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);

  const pickAndUpload = async () => {
    // Must copy to cache so expo-file-system can access it for upload
    // (SAF content URIs from copyToCacheDirectory:false cause IOException)
    const result = await DocumentPicker.getDocumentAsync({
      type: ["video/*"],
      copyToCacheDirectory: true,
    });
    if (result.canceled || !result.assets.length) return;

    const asset = result.assets[0];
    setBusy(true);
    setProgress(0);
    try {
      // Read file size
      const info = await FileSystem.getInfoAsync(asset.uri);
      const size = info.exists && "size" in info ? (info.size ?? 0) : 0;
      if (size === 0) throw new Error("Cannot read file size");

      // Get upload session from YouTube (directly from phone)
      const { uploadURI, accessToken } = await yt.createUploadSession({
        title: `CloudVault - ${asset.name}`.slice(0, 100),
        description: `CloudVault private video: ${asset.name}`,
        mimeType: asset.mimeType ?? "video/mp4",
        sizeBytes: size,
      });

      // Stream the file to YouTube natively
      const task = FileSystem.createUploadTask(
        uploadURI,
        asset.uri,
        {
          uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
          httpMethod: "PUT",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": asset.mimeType ?? "video/mp4",
          },
        },
        (progressEvent) => {
          const expected = progressEvent.totalBytesExpectedToSend;
          if (expected > 0) {
            setProgress(Math.min(99, Math.round((progressEvent.totalBytesSent / expected) * 100)));
          }
        }
      );
      const putRes = await task.uploadAsync();

      let videoId: string | undefined;
      if (putRes && putRes.status >= 200 && putRes.status < 300) {
        try {
          videoId = (JSON.parse(putRes.body) as { id?: string }).id;
        } catch {
          /* ignore */
        }
      } else {
        throw new Error(
          `YouTube upload failed: ${putRes ? `${putRes.status} ${putRes.body.slice(0, 200)}` : "no response"}`
        );
      }

      if (!videoId) throw new Error("YouTube did not return a video id");

      // Extract and save thumbnail permanently to document storage
      let permanentThumbnail: string | null = null;
      try {
        const tempThumbnail = await yt.getLocalThumbnail(asset.uri);
        if (tempThumbnail) {
          permanentThumbnail = await storage.savePermanentThumbnail(tempThumbnail, videoId);
        }
      } catch {
        /* thumbnail extraction best-effort */
      }

      const fileItem: FileItem = {
        id: videoId,
        originalName: asset.name,
        mimeType: asset.mimeType ?? "video/mp4",
        sizeBytes: size,
        mediaKind: "video",
        externalId: videoId,
        thumbnailUrl: permanentThumbnail ?? yt.getThumbnailUrl(videoId),
        status: "uploaded",
        createdAt: new Date().toISOString(),
      };

      // Persist to local JSON catalog
      await storage.saveLocalFile(fileItem);

      // Add to CloudVault playlist (best-effort)
      try {
        const playlistId = await yt.getOrCreatePlaylist();
        await yt.addToPlaylist(playlistId, videoId);
      } catch {
        /* playlist filing failed — not fatal */
      }

      setProgress(100);
      Alert.alert("Upload complete", "Your video is now stored privately on YouTube.");
      setProgress(null);
      router.replace("/(tabs)/library");
    } catch (e: any) {
      Alert.alert("Upload failed", e.message ?? "Something went wrong");
      setProgress(null);
    } finally {
      setBusy(false);
      // Clean up the cached copy to reclaim storage
      try {
        if (asset.uri.startsWith(FileSystem.cacheDirectory ?? "")) {
          await FileSystem.deleteAsync(asset.uri, { idempotent: true });
        }
      } catch {
        /* cleanup best-effort */
      }
    }
  };

  return (
    <View style={styles.container}>
      <Pressable
        style={[styles.button, (busy || progress !== null) && styles.disabled]}
        onPress={pickAndUpload}
        disabled={busy || progress !== null}
      >
        {busy || progress !== null ? (
          <>
            <ActivityIndicator color="#fff" />
            <Text style={styles.buttonText}>
              {progress !== null ? `Uploading ${progress}%` : "Uploading..."}
            </Text>
          </>
        ) : (
          <Text style={styles.buttonText}>Pick Video</Text>
        )}
      </Pressable>
      <Text style={styles.hint}>
        Videos upload directly to your private YouTube channel.
        No data passes through any server.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0b0b0f",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  button: {
    backgroundColor: "#e5353b",
    borderRadius: 14,
    paddingVertical: 18,
    paddingHorizontal: 40,
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
  },
  disabled: { opacity: 0.7 },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  hint: { color: "#9a9aa5", fontSize: 13, marginTop: 24, textAlign: "center", lineHeight: 20 },
});
