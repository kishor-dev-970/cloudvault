import { API_URL } from "./config";

export interface User {
  id: string;
  email: string;
}

export interface FileItem {
  id: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  mediaKind: "video" | "image";
  externalId: string;
  thumbnailUrl: string | null;
  status: "uploading" | "uploaded" | "failed";
  createdAt: string;
}

class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

let token: string | null = null;

export function setToken(t: string | null) {
  token = t;
}

async function request<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    ...(opts.headers as Record<string, string>),
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (opts.body && !(opts.body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
  }

  const res = await fetch(`${API_URL}${path}`, { ...opts, headers });
  if (!res.ok) {
    let message = res.statusText;
    try {
      const data = await res.json();
      message = data.error ?? message;
    } catch {
      /* ignore */
    }
    throw new ApiError(res.status, message);
  }
  return res.json() as Promise<T>;
}

export const api = {
  signup: (email: string, password: string) =>
    request<{ token: string; user: User }>("/auth/signup", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  login: (email: string, password: string) =>
    request<{ token: string; user: User }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  googleAuthUrl: () =>
    request<{ authUrl: string }>("/auth/google"),
  pendingGoogleSession: () =>
    request<{ token: string; email: string; connected: boolean; channelId?: string }>("/auth/pending-session"),
  youtubeAuthUrl: () =>
    request<{ authUrl: string }>("/connect/youtube"),
  youtubeStatus: () =>
    request<{ connected: boolean; channelId?: string }>("/connect/youtube/status"),
  youtubeConnect: (code: string) =>
    request<{ connected: boolean; channelId: string }>("/connect/youtube/callback", {
      method: "POST",
      body: JSON.stringify({ code }),
    }),
  listFiles: () =>
    request<{ files: FileItem[] }>("/files"),
  getStreamUrl: (id: string) =>
    request<{ url: string; fileId: string; externalId: string }>(`/files/${id}/stream`),
  uploadSession: (file: { name: string; mimeType: string; size?: number }) =>
    request<{ uploadURI: string; accessToken: string; expiresIn?: number }>("/files/upload-session", {
      method: "POST",
      body: JSON.stringify({ name: file.name, mimeType: file.mimeType, size: file.size ?? 0 }),
    }),
  completeUpload: (payload: { videoId: string; name: string; mimeType: string; size?: number }) =>
    request<{ fileId: string; status: string; externalId: string; thumbnailUrl: string | null }>(
      "/files/complete",
      { method: "POST", body: JSON.stringify(payload) }
    ),
  upload: async (
    file: { uri: string; name: string; mimeType: string; size?: number },
    onProgress?: (pct: number) => void
  ) => {
    // Videos stream straight to YouTube (resumable, no bytes through Render).
    // Images go through the server relay because the server converts photo -> video
    // via ffmpeg before storing privately on YouTube.
    if (file.mimeType.startsWith("image/")) {
      return uploadChunked(file, onProgress);
    }
    return uploadDirectToYouTube(file, onProgress);
  },
  /** Direct resumable upload regardless of size (used by auto-sync for camera files). */
  uploadLarge: (
    file: { uri: string; name: string; mimeType: string },
    onProgress?: (pct: number) => void
  ) =>
    !file.mimeType.startsWith("image/")
      ? uploadDirectToYouTube(file, onProgress)
      : uploadChunked(file, onProgress),
};

function u8ToB64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000) as unknown as number[]);
  }
  return btoa(s);
}

async function uploadChunked(
  file: { uri: string; name: string; mimeType: string; size?: number },
  onProgress?: (pct: number) => void
): Promise<string | undefined> {
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  headers["Content-Type"] = "application/json";

  const PIECE = 8 * 1024 * 1024;
  const uploadId = `${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
  const total = file.size ?? 0;
  let sentBytes = 0;

  const sendPiece = async (bytes: Uint8Array, last: boolean, index: number) => {
    const res = await fetch(`${API_URL}/files/chunk`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        uploadId,
        index,
        data: u8ToB64(bytes),
        last,
        filename: encodeURIComponent(file.name),
        mimeType: file.mimeType,
      }),
    });
    if (!last) {
      if (!res.ok) {
        let msg = "Chunk failed";
        try {
          msg = (await res.json()).error ?? msg;
        } catch {
          /* ignore */
        }
        throw new ApiError(res.status, msg);
      }
      sentBytes += bytes.length;
      if (total > 0 && onProgress) onProgress(Math.min(99, Math.round((sentBytes / total) * 90)));
      return undefined;
    }
    // Final chunk: server processes the file and streams NDJSON progress back.
    const reader = res.body?.getReader();
    const decoder = new TextDecoder();
    let lastId: string | undefined;
    if (reader) {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const text = decoder.decode(value, { stream: true });
        for (const line of text.split("\n").filter(Boolean)) {
          const data = JSON.parse(line);
          if (data.fileId) lastId = data.fileId;
          if (data.progress != null && onProgress) onProgress(data.progress);
          if (data.status === "failed") {
            throw new ApiError(res.status, data.error ?? "Upload failed");
          }
        }
      }
    }
    if (!res.ok) {
      throw new ApiError(res.status, "Upload failed");
    }
    return lastId;
  };

  const response = await fetch(file.uri);
  const reader = response.body?.getReader();
  if (!reader) throw new ApiError(0, "Cannot read file");
  let acc = new Uint8Array(0);
  let index = 0;
  let lastId: string | undefined;
  while (true) {
    const { done, value } = await reader.read();
    if (value && value.length > 0) {
      const next = new Uint8Array(acc.length + value.length);
      next.set(acc);
      next.set(value, acc.length);
      acc = next;
    }
    if (acc.length >= PIECE || done) {
      const isLast = !!done;
      const id = await sendPiece(acc, isLast, index);
      index += 1;
      acc = new Uint8Array(0);
      if (isLast) {
        lastId = id;
        break;
      }
    }
    if (done) break;
  }
  return lastId;
}

/**
 * Direct resumable upload to YouTube: the server issues a Google upload URI + a
 * short-lived access token; the phone PUTs the media bytes straight to YouTube
 * (one hop, no throughput through Render), then records the upload server-side.
 */
async function uploadDirectToYouTube(
  file: { uri: string; name: string; mimeType: string; size?: number },
  onProgress?: (pct: number) => void
): Promise<string | undefined> {
  const { uploadURI, accessToken } = await api.uploadSession({
    name: file.name,
    mimeType: file.mimeType,
    size: file.size ?? 0,
  });

  const resp = await fetch(file.uri);
  const blob = await resp.blob();
  const total = blob.size || file.size || 0;
  if (total === 0) throw new ApiError(0, "Cannot read file size");

  const PIECE = 8 * 1024 * 1024;
  let start = 0;
  let videoId: string | undefined;

  while (start < total) {
    const end = Math.min(start + PIECE, total);
    const isLast = end >= total;
    const body = blob.slice(start, end);
    const headers: Record<string, string> = {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": file.mimeType,
      "Content-Range": `bytes ${start}-${end - 1}/${total}`,
    };

    const putRes = await fetch(uploadURI, { method: "PUT", headers, body });
    if (!putRes.ok) {
      const text = await putRes.text().catch(() => "");
      throw new ApiError(putRes.status, `YouTube upload failed (${putRes.status}): ${text.slice(0, 200)}`);
    }

    if (isLast) {
      const text = await putRes.text().catch(() => "");
      try {
        videoId = (JSON.parse(text) as { id?: string }).id;
      } catch {
        /* ignore parse errors; server may still verify */
      }
    }

    start = end;
    if (onProgress) onProgress(Math.min(99, Math.round((start / total) * 100)));
  }

  if (!videoId) throw new ApiError(0, "YouTube did not return a video id");
  await api.completeUpload({ videoId, name: file.name, mimeType: file.mimeType, size: total });
  if (onProgress) onProgress(100);
  return videoId;
}
