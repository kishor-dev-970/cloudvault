import { google } from "googleapis";
import { createReadStream } from "fs";
import { env } from "../config.js";

export const youtube = google.youtube("v3");

export function buildOAuthClient(accessToken?: string, refreshToken?: string) {
  const oauth = new google.auth.OAuth2(
    env.GOOGLE_CLIENT_ID,
    env.GOOGLE_CLIENT_SECRET,
    env.GOOGLE_REDIRECT_URI
  );
  if (accessToken) oauth.setCredentials({ access_token: accessToken });
  if (refreshToken) oauth.setCredentials({ refresh_token: refreshToken });
  return oauth;
}

export function getAuthUrl() {
  const oauth = buildOAuthClient();
  return oauth.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: [
      "https://www.googleapis.com/auth/youtube.upload",
      "https://www.googleapis.com/auth/youtube.readonly",
    ],
  });
}

export async function exchangeCode(
  code: string
): Promise<{ accessToken: string; refreshToken: string; channelId: string }> {
  const oauth = buildOAuthClient();
  const { tokens } = await oauth.getToken(code);
  oauth.setCredentials(tokens);

  const res = await youtube.channels.list({
    auth: oauth,
    part: ["id"],
    mine: true,
  });
  const channelId = res.data.items?.[0]?.id ?? "";

  return {
    accessToken: tokens.access_token ?? "",
    refreshToken: tokens.refresh_token ?? "",
    channelId,
  };
}

export async function refreshAccessToken(refreshToken: string): Promise<string> {
  const oauth = buildOAuthClient(undefined, refreshToken);
  const { token } = await oauth.getAccessToken();
  return token ?? "";
}

export async function uploadPrivateVideo(opts: {
  refreshToken: string;
  filePath: string;
  title: string;
  description?: string;
  mimeType?: string;
  onProgress?: (progress: { bytesWritten: number; total: number }) => void;
}): Promise<string> {
  const oauth = buildOAuthClient(undefined, opts.refreshToken);
  const total = (await import("fs")).statSync(opts.filePath).size;

  const requestBody = {
    snippet: {
      title: opts.title,
      description: opts.description ?? "",
      categoryId: "22",
    },
    status: {
      privacyStatus: "private",
      selfDeclaredMadeForKids: false,
    },
  };

  const media = {
    mimeType: opts.mimeType ?? "video/mp4",
    body: createReadStream(opts.filePath),
  };

  const res = await youtube.videos.insert({
    auth: oauth,
    part: ["snippet", "status"],
    requestBody,
    media,
  }, {
    onUploadProgress: (evt) => {
      if (opts.onProgress) opts.onProgress({ bytesWritten: evt.bytesRead, total });
    },
  });

  return res.data.id ?? "";
}

export async function getVideoThumbnail(videoId: string): Promise<string> {
  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}

const PLAYLIST_TITLE = "CloudVault";

/** Find the user's private "CloudVault" playlist, creating it if needed. */
export async function getOrCreateCloudVaultPlaylist(refreshToken: string): Promise<string> {
  const oauth = buildOAuthClient(undefined, refreshToken);

  const listed = await youtube.playlists.list({
    auth: oauth,
    part: ["snippet"],
    mine: true,
    maxResults: 50,
  });
  const existing = (listed.data.items ?? []).find((p) => p.snippet?.title === PLAYLIST_TITLE);
  if (existing?.id) return existing.id;

  const created = await youtube.playlists.insert({
    auth: oauth,
    part: ["snippet", "status"],
    requestBody: {
      snippet: {
        title: PLAYLIST_TITLE,
        description: "Private media stored by the CloudVault app.",
      },
      status: { privacyStatus: "private" },
    },
  });
  if (!created.data.id) throw new Error("Could not create CloudVault playlist");
  return created.data.id;
}

/** Add a video to a playlist (duplicates allowed by YouTube; callers dedupe). */
export async function addVideoToPlaylist(
  refreshToken: string,
  playlistId: string,
  videoId: string
): Promise<void> {
  const oauth = buildOAuthClient(undefined, refreshToken);
  await youtube.playlistItems.insert({
    auth: oauth,
    part: ["snippet"],
    requestBody: {
      snippet: {
        playlistId,
        resourceId: { kind: "youtube#video", videoId },
      },
    },
  });
}
