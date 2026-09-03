import * as MediaLibrary from "expo-media-library/legacy";
import * as SecureStore from "expo-secure-store";
import { api } from "../api/client";

const ENABLE_KEY = "cloudvault_autosync_enabled";
const IDS_KEY = "cloudvault_autosync_ids";
const LAST_KEY = "cloudvault_autosync_last";

const MAX_PER_SYNC = 10;
const COOLDOWN_MS = 2 * 60 * 1000;

let running = false;

export async function isAutoSyncEnabled(): Promise<boolean> {
  try {
    return (await SecureStore.getItemAsync(ENABLE_KEY)) === "1";
  } catch {
    return false;
  }
}

export async function setAutoSyncEnabled(v: boolean): Promise<void> {
  await SecureStore.setItemAsync(ENABLE_KEY, v ? "1" : "0");
}

export async function ensureMediaPermission(): Promise<boolean> {
  const perm = await MediaLibrary.requestPermissionsAsync();
  return perm.granted;
}

function mimeFor(filename: string, mediaType: string): string | null {
  const ext = (filename.split(".").pop() ?? "").toLowerCase();
  const map: Record<string, string> = {
    mp4: "video/mp4",
    mov: "video/quicktime",
    "3gp": "video/3gpp",
    mkv: "video/x-matroska",
    webm: "video/webm",
    avi: "video/x-msvideo",
    m4v: "video/x-m4v",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    gif: "image/gif",
  };
  if (map[ext]) return map[ext];
  if (mediaType === "video") return "video/mp4";
  if (mediaType === "photo") return "image/jpeg";
  return null;
}

/**
 * Upload camera photos/videos newer than the last check that aren't already in
 * CloudVault. Runs only while the app is open (Expo Go cannot reliably run
 * background uploads with the app closed). Gentle: cooldown + per-sync cap.
 */
export async function syncNewMedia(): Promise<{ uploaded: number; checked: number }> {
  if (running) return { uploaded: 0, checked: 0 };
  if (!(await isAutoSyncEnabled())) return { uploaded: 0, checked: 0 };
  running = true;
  try {
    const lastRaw = await SecureStore.getItemAsync(LAST_KEY).catch(() => null);
    const lastCheck = Number(lastRaw ?? 0);
    if (Date.now() - lastCheck < COOLDOWN_MS) return { uploaded: 0, checked: 0 };

    const perm = await MediaLibrary.getPermissionsAsync();
    if (!perm.granted) return { uploaded: 0, checked: 0 };

    const [idsRaw, server] = await Promise.all([
      SecureStore.getItemAsync(IDS_KEY).catch(() => null),
      api.listFiles().catch(() => ({ files: [] as { originalName: string }[] })),
    ]);
    const uploadedIds = new Set<string>(JSON.parse(idsRaw ?? "[]"));
    const serverNames = new Set(server.files.map((f) => f.originalName));

    const page = await MediaLibrary.getAssetsAsync({
      mediaType: ["photo", "video"],
      sortBy: [["creationTime", false]],
      first: 50,
    });
    const todo = page.assets
      .filter((a) => a.creationTime > lastCheck - 60_000)
      .filter((a) => !uploadedIds.has(a.id) && !serverNames.has(a.filename ?? ""))
      .slice(0, MAX_PER_SYNC);

    let uploaded = 0;
    for (const asset of todo) {
      const mime = mimeFor(asset.filename ?? "", asset.mediaType);
      if (!mime) continue;
      try {
        await api.uploadLarge({
          uri: asset.uri,
          name: asset.filename ?? `media-${asset.id}`,
          mimeType: mime,
        });
        uploadedIds.add(asset.id);
        uploaded += 1;
      } catch {
        /* retry next sync */
      }
    }

    await SecureStore.setItemAsync(IDS_KEY, JSON.stringify([...uploadedIds].slice(-2000))).catch(() => {});
    await SecureStore.setItemAsync(LAST_KEY, String(Date.now())).catch(() => {});
    return { uploaded, checked: todo.length };
  } finally {
    running = false;
  }
}
