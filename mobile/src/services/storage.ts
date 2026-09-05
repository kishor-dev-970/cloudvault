import * as FileSystem from "expo-file-system/legacy";
import * as SecureStore from "expo-secure-store";
import { FileItem } from "../api/client";

const FILES_PATH = `${FileSystem.documentDirectory}cloudvault_files.json`;
const SYNCED_IDS_PATH = `${FileSystem.documentDirectory}cloudvault_synced_ids.json`;
const THUMBNAILS_DIR = `${FileSystem.documentDirectory}thumbnails/`;

const LEGACY_FILES_KEY = "cloudvault_files";
const LEGACY_IDS_KEY = "cloudvault_autosync_ids";

let migrated = false;

/** Migrate any legacy records from SecureStore to document filesystem. */
async function ensureMigration(): Promise<void> {
  if (migrated) return;
  migrated = true;

  try {
    const info = await FileSystem.getInfoAsync(FILES_PATH);
    if (!info.exists) {
      const legacyRaw = await SecureStore.getItemAsync(LEGACY_FILES_KEY).catch(() => null);
      if (legacyRaw) {
        await FileSystem.writeAsStringAsync(FILES_PATH, legacyRaw);
        await SecureStore.deleteItemAsync(LEGACY_FILES_KEY).catch(() => {});
      }
    }

    const idsInfo = await FileSystem.getInfoAsync(SYNCED_IDS_PATH);
    if (!idsInfo.exists) {
      const legacyIdsRaw = await SecureStore.getItemAsync(LEGACY_IDS_KEY).catch(() => null);
      if (legacyIdsRaw) {
        await FileSystem.writeAsStringAsync(SYNCED_IDS_PATH, legacyIdsRaw);
        await SecureStore.deleteItemAsync(LEGACY_IDS_KEY).catch(() => {});
      }
    }
  } catch {
    /* ignore migration errors */
  }
}

/** Get all locally stored files. */
export async function getLocalFiles(): Promise<FileItem[]> {
  await ensureMigration();
  try {
    const info = await FileSystem.getInfoAsync(FILES_PATH);
    if (!info.exists) return [];
    const content = await FileSystem.readAsStringAsync(FILES_PATH);
    return JSON.parse(content) as FileItem[];
  } catch {
    return [];
  }
}

/** Save the full list of files to persistent local storage. */
export async function saveLocalFiles(files: FileItem[]): Promise<void> {
  try {
    await FileSystem.writeAsStringAsync(FILES_PATH, JSON.stringify(files));
  } catch (err) {
    console.error("Failed to save local files:", err);
  }
}

/** Add or update a file in the local catalog. */
export async function saveLocalFile(file: FileItem): Promise<void> {
  const files = await getLocalFiles();
  const existingIdx = files.findIndex((f) => f.id === file.id || (file.externalId && f.externalId === file.externalId));
  if (existingIdx >= 0) {
    files[existingIdx] = { ...files[existingIdx], ...file };
  } else {
    files.unshift(file);
  }
  await saveLocalFiles(files);
}

/** Remove a file from local catalog by its ID or external ID. */
export async function removeLocalFile(fileId: string): Promise<void> {
  const files = await getLocalFiles();
  const filtered = files.filter((f) => f.id !== fileId && f.externalId !== fileId);
  await saveLocalFiles(filtered);
}

/** Save a captured thumbnail permanently in document storage so OS cache cleaners don't delete it. */
export async function savePermanentThumbnail(tempUri: string, videoId: string): Promise<string> {
  try {
    const dirInfo = await FileSystem.getInfoAsync(THUMBNAILS_DIR);
    if (!dirInfo.exists) {
      await FileSystem.makeDirectoryAsync(THUMBNAILS_DIR, { intermediates: true });
    }
    const permanentPath = `${THUMBNAILS_DIR}${videoId}.jpg`;
    await FileSystem.copyAsync({ from: tempUri, to: permanentPath });
    return permanentPath;
  } catch {
    // If copying fails, fallback to using the original temporary URI
    return tempUri;
  }
}

/** Get the set of asset IDs already synced by auto-sync. */
export async function getSyncedIds(): Promise<Set<string>> {
  await ensureMigration();
  try {
    const info = await FileSystem.getInfoAsync(SYNCED_IDS_PATH);
    if (!info.exists) return new Set();
    const content = await FileSystem.readAsStringAsync(SYNCED_IDS_PATH);
    const parsed = JSON.parse(content) as string[];
    return new Set(parsed);
  } catch {
    return new Set();
  }
}

/** Mark an asset ID as synced. */
export async function addSyncedId(id: string): Promise<void> {
  const ids = await getSyncedIds();
  ids.add(id);
  try {
    // Keep the most recent 5,000 IDs to bound memory
    const list = Array.from(ids).slice(-5000);
    await FileSystem.writeAsStringAsync(SYNCED_IDS_PATH, JSON.stringify(list));
  } catch (err) {
    console.error("Failed to save synced IDs:", err);
  }
}
