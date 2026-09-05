import * as MediaLibrary from "expo-media-library/legacy";
import * as SecureStore from "expo-secure-store";
import * as FileSystem from "expo-file-system/legacy";
import * as yt from "./youtube";
import { FileItem } from "../api/client";

const ENABLE_KEY = "cloudvault_autosync_enabled";
const IDS_KEY = "cloudvault_autosync_ids";
const LAST_KEY = "cloudvault_autosync_last";
const FILES_KEY = "cloudvault_files";

const MAX_PER_SYNC = 5;
const COOLDOWN_MS = 2 * 60 * 1000;

let running = false;

export async function isAutoSyncEnabled(): Promise<boolean> {
  return (await SecureStore.getItemAsync(ENABLE_KEY)) === "1";
}

export async function setAutoSyncEnabled(v: boolean): Promise<void> {
  await SecureStore.setItemAsync(ENABLE_KEY, v ? "1" : "0");
}

export async function ensureMediaPermission(): Promise<boolean> {
  const perm = await MediaLibrary.requestPermissionsAsync();
  return perm.granted;
}

async function getLocalFiles(): Promise<FileItem[]> {
  const raw = await SecureStore.getItemAsync(FILES_KEY);
  return raw ? JSON.parse(raw) : [];
}

export async function syncNewMedia(): Promise<{ uploaded: number; checked: number }> {
  if (running) return { uploaded: 0, checked: 0 };
  if (!(await isAutoSyncEnabled())) return { uploaded: 0, checked: 0 };
  if (!(await yt.isConnected())) return { uploaded: 0, checked: 0 };
  running = true;
  try {
    const lastRaw = await SecureStore.getItemAsync(LAST_KEY).catch(() => null);
    const lastCheck = Number(lastRaw ?? 0);
    if (Date.now() - lastCheck < COOLDOWN_MS) return { uploaded: 0, checked: 0 };

    const perm = await MediaLibrary.getPermissionsAsync();
    if (!perm.granted) return { uploaded: 0, checked: 0 };

    const [idsRaw, localRaw] = await Promise.all([
      SecureStore.getItemAsync(IDS_KEY).catch(() => null),
      getLocalFiles(),
    ]);
    const uploadedIds = new Set<string>(JSON.parse(idsRaw ?? "[]"));
    const localNames = new Set(localRaw.map((f) => f.originalName));

    const page = await MediaLibrary.getAssetsAsync({
      mediaType: ["video"],
      sortBy: [["creationTime", false]],
      first: 50,
    });
    const todo = page.assets
      .filter((a) => a.creationTime > lastCheck - 60_000)
      .filter((a) => !uploadedIds.has(a.id) && !localNames.has(a.filename ?? ""))
      .slice(0, MAX_PER_SYNC);

    let uploaded = 0;
    for (const asset of todo) {
      try {
        const anyAsset = asset as { uri?: string; fileSize?: number | null } & typeof asset;
        const name = asset.filename ?? `video-${asset.id}`;
        const size = anyAsset.fileSize ?? 0;
        if (size === 0) continue;

        const { uploadURI, accessToken } = await yt.createUploadSession({
          title: `CloudVault - ${name}`.slice(0, 100),
          description: `Auto-uploaded: ${name}`,
          mimeType: "video/mp4",
          sizeBytes: size,
        });

        const response = await FileSystem.uploadAsync(uploadURI, anyAsset.uri!, {
          uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
          httpMethod: "PUT",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "video/mp4",
          },
        });

        let videoId: string | undefined;
        if (response.status >= 200 && response.status < 300) {
          try {
            videoId = (JSON.parse(response.body) as { id?: string }).id;
          } catch {}
        }

        if (videoId) {
          const fileItem: FileItem = {
            id: videoId,
            originalName: name,
            mimeType: "video/mp4",
            sizeBytes: size,
            mediaKind: "video",
            externalId: videoId,
            thumbnailUrl:
              (await yt.getLocalThumbnail(anyAsset.uri!)) ?? yt.getThumbnailUrl(videoId),
            status: "uploaded",
            createdAt: new Date().toISOString(),
          };
          const files = await getLocalFiles();
          files.unshift(fileItem);
          await SecureStore.setItemAsync(FILES_KEY, JSON.stringify(files.slice(0, 500)));

          // Add to playlist (best-effort)
          try {
            const playlistId = await yt.getOrCreatePlaylist();
            await yt.addToPlaylist(playlistId, videoId);
          } catch {}

          uploadedIds.add(asset.id);
          uploaded += 1;
        }
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
