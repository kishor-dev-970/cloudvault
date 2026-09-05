import { useState } from "react";
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import { useRouter } from "expo-router";
import * as yt from "../../src/services/youtube";
import { FileItem } from "../../src/api/client";
import * as SecureStore from "expo-secure-store";

const FILES_KEY = "cloudvault_files";

async function getLocalFiles(): Promise<FileItem[]> {
  const raw = await SecureStore.getItemAsync(FILES_KEY);
  return raw ? JSON.parse(raw) : [];
}

async function saveLocalFile(file: FileItem): Promise<void> {
  const files = await getLocalFiles();
  files.unshift(file);
  await SecureStore.setItemAsync(FILES_KEY, JSON.stringify(files.slice(0, 500)));
}

export default function Upload() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);

  const pickAndUpload = async () => {
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
      const size = info.exists && "size" in info ? info.size : 0;
      if (size === 0) throw new Error("Cannot read file size");

      // Get upload session from YouTube (directly from phone)
      const { uploadURI, accessToken } = await yt.createUploadSession({
        title: `CloudVault - ${asset.name}`.slice(0, 100),
        description: `CloudVault private video: ${asset.name}`,
        mimeType: asset.mimeType ?? "video/mp4",
        sizeBytes: size,
      });

      // Stream the file to YouTube natively (avoids RN blob bridge limits)
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
        (progress) => {
          const expected = progress.totalBytesExpectedToSend;
          if (expected > 0) {
            setProgress(Math.min(99, Math.round((progress.totalBytesSent / expected) * 100)));
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
        throw new Error(`YouTube upload failed: ${putRes ? `${putRes.status} ${putRes.body.slice(0, 200)}` : "no response"}`);
      }

      if (!videoId) throw new Error("YouTube did not return a video id");

      // Save to local library (with the original gallery thumbnail)
      const fileItem: FileItem = {
        id: videoId,
        originalName: asset.name,
        mimeType: asset.mimeType ?? "video/mp4",
        sizeBytes: size,
        mediaKind: "video",
        externalId: videoId,
        thumbnailUrl: (await yt.getLocalThumbnail(asset.uri)) ?? yt.getThumbnailUrl(videoId),
        status: "uploaded",
        createdAt: new Date().toISOString(),
      };
      await saveLocalFile(fileItem);

      // Try to add to CloudVault playlist (best-effort)
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
  container: { flex: 1, backgroundColor: "#0b0b0f", alignItems: "center", justifyContent: "center", padding: 24 },
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
