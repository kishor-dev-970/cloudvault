import { useState } from "react";
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import { useRouter } from "expo-router";
import { api } from "../../src/api/client";

export default function Upload() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);

  const pickAndUpload = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: ["video/*", "image/*"],
      // Cache copy gives a file:// URI, which fetch() can read (it cannot read
      // content:// URIs on this device).
      copyToCacheDirectory: true,
    });
    if (result.canceled || !result.assets.length) return;

    const asset = result.assets[0];
    setBusy(true);
    setProgress(0);
    try {
      await api.upload(
        { uri: asset.uri, name: asset.name, mimeType: asset.mimeType ?? "application/octet-stream", size: asset.size ?? undefined },
        (pct) => setProgress(pct)
      );
      Alert.alert("Upload complete", "Your file is now stored privately online.");
      setProgress(null);
      // Go to Library so the fresh list (with thumbnail) is fetched and shown.
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
          <Text style={styles.buttonText}>Pick Video or Photo</Text>
        )}
      </Pressable>
      <Text style={styles.hint}>
        Videos upload directly. Photos are converted to a short video so they can
        be stored privately on YouTube.
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
