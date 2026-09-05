import * as SecureStore from "expo-secure-store";
import * as Crypto from "expo-crypto";
import * as VideoThumbnails from "expo-video-thumbnails";
import { GOOGLE_CLIENT_ID, oauthRedirectScheme, OAUTH_PATH } from "../api/config";

const CLIENT_ID = GOOGLE_CLIENT_ID;

const SCOPES = [
  "https://www.googleapis.com/auth/youtube.upload",
  "https://www.googleapis.com/auth/youtube.readonly",
  "https://www.googleapis.com/auth/youtube.force-ssl",
];

const REFRESH_KEY = "cv_yt_refresh";
const ACCESS_KEY = "cv_yt_access";
const ACCESS_EXPIRY_KEY = "cv_yt_access_expiry";
const CHANNEL_KEY = "cv_yt_channel";

const discovery = {
  authorizationEndpoint: "https://accounts.google.com/o/oauth2/v2/auth",
  tokenEndpoint: "https://oauth2.googleapis.com/token",
  revocationEndpoint: "https://oauth2.googleapis.com/revoke",
};

/** Build the OAuth redirect URI for this app.
 *  Google Android OAuth clients expect `com.googleusercontent.apps.<num>:/oauth2redirect`
 *  (single slash). AuthSession.makeRedirectUri produces a `://` URL, which Google
 *  rejects with error 400, so build it by hand. */
export function getRedirectUri() {
  return `${oauthRedirectScheme()}:/${OAUTH_PATH}`;
}

/** Generate the Google OAuth authorization URL with PKCE. */
export async function getAuthUrl(): Promise<{ url: string; codeVerifier: string; state: string }> {
  const codeVerifier = Crypto.randomUUID();
  const hashed = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    codeVerifier,
    { encoding: Crypto.CryptoEncoding.BASE64 }
  );
  const codeChallenge = hashed
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  const redirectUri = getRedirectUri();
  const state = Crypto.randomUUID();

  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  });

  return { url: `${discovery.authorizationEndpoint}?${params.toString()}`, codeVerifier, state };
}

/** Exchange an authorization code for tokens (with PKCE). */
export async function exchangeCode(
  code: string,
  codeVerifier: string
): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }> {
  const redirectUri = getRedirectUri();
  const res = await fetch(discovery.tokenEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: CLIENT_ID,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
      code_verifier: codeVerifier,
    }).toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token exchange failed (${res.status}): ${text.slice(0, 300)}`);
  }

  const data = await res.json();
  return {
    accessToken: data.access_token ?? "",
    refreshToken: data.refresh_token ?? "",
    expiresIn: data.expires_in ?? 3600,
  };
}

/** Get a fresh access token using the stored refresh token. */
export async function getAccessToken(): Promise<string> {
  // Check cached token
  const cached = await SecureStore.getItemAsync(ACCESS_KEY);
  const expiry = await SecureStore.getItemAsync(ACCESS_EXPIRY_KEY);
  if (cached && expiry && Date.now() < Number(expiry) - 60_000) {
    return cached;
  }

  // Refresh
  const refreshToken = await SecureStore.getItemAsync(REFRESH_KEY);
  if (!refreshToken) throw new Error("Not connected to YouTube");

  const res = await fetch(discovery.tokenEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }).toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token refresh failed (${res.status}): ${text.slice(0, 300)}`);
  }

  const data = await res.json();
  const accessToken = data.access_token ?? "";
  const expiresIn = data.expires_in ?? 3600;

  await SecureStore.setItemAsync(ACCESS_KEY, accessToken);
  await SecureStore.setItemAsync(ACCESS_EXPIRY_KEY, String(Date.now() + expiresIn * 1000));

  return accessToken;
}

/** Store tokens after successful OAuth. */
export async function storeTokens(accessToken: string, refreshToken: string) {
  await SecureStore.setItemAsync(ACCESS_KEY, accessToken);
  if (refreshToken) await SecureStore.setItemAsync(REFRESH_KEY, refreshToken);
  await SecureStore.setItemAsync(ACCESS_EXPIRY_KEY, String(Date.now() + 3600 * 1000));
}

/** Store channel ID after lookup. */
export async function storeChannelId(channelId: string) {
  await SecureStore.setItemAsync(CHANNEL_KEY, channelId);
}

/** Check if we have a stored refresh token (YouTube connected). */
export async function isConnected(): Promise<boolean> {
  return (await SecureStore.getItemAsync(REFRESH_KEY)) !== null;
}

/** Get stored channel ID. */
export async function getChannelId(): Promise<string | null> {
  return SecureStore.getItemAsync(CHANNEL_KEY);
}

/** Clear all stored YouTube tokens. */
export async function clearTokens() {
  await SecureStore.deleteItemAsync(REFRESH_KEY).catch(() => {});
  await SecureStore.deleteItemAsync(ACCESS_KEY).catch(() => {});
  await SecureStore.deleteItemAsync(ACCESS_EXPIRY_KEY).catch(() => {});
  await SecureStore.deleteItemAsync(CHANNEL_KEY).catch(() => {});
}

/** Look up the user's YouTube channel ID. */
export async function fetchChannelId(): Promise<string> {
  const token = await getAccessToken();
  const res = await fetch("https://www.googleapis.com/youtube/v3/channels?part=id&mine=true", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("Could not fetch channel");
  const data = await res.json();
  return data.items?.[0]?.id ?? "";
}

/** Create a YouTube resumable upload session. */
export async function createUploadSession(opts: {
  title: string;
  description: string;
  mimeType: string;
  sizeBytes: number;
}): Promise<{ uploadURI: string; accessToken: string }> {
  const token = await getAccessToken();

  const res = await fetch(
    "https://www.googleapis.com/upload/youtube/v3/videos?part=snippet,status&uploadType=resumable",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json; charset=UTF-8",
        "X-Upload-Content-Length": String(opts.sizeBytes),
        "X-Upload-Content-Type": opts.mimeType,
      },
      body: JSON.stringify({
        snippet: { title: opts.title, description: opts.description, categoryId: "22" },
        status: { privacyStatus: "private", selfDeclaredMadeForKids: false },
      }),
    }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Upload session failed (${res.status}): ${text.slice(0, 500)}`);
  }

  const uploadURI = res.headers.get("location") ?? "";
  if (!uploadURI) throw new Error("YouTube did not return an upload URI");
  return { uploadURI, accessToken: token };
}

/** Get thumbnail URL for a video. */
export function getThumbnailUrl(videoId: string): string {
  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}

/** Extract the original video frame (as seen in the gallery) to a local thumbnail file. */
export async function getLocalThumbnail(fileUri: string): Promise<string | null> {
  try {
    const { uri } = await VideoThumbnails.getThumbnailAsync(fileUri, {
      time: 0,
      quality: 0.6,
    });
    return uri;
  } catch {
    return null;
  }
}

const PLAYLIST_TITLE = "CloudVault";

/** Find or create the private CloudVault playlist. */
export async function getOrCreatePlaylist(): Promise<string> {
  const token = await getAccessToken();
  const oauth = `Bearer ${token}`;

  // List playlists
  const listed = await fetch(
    "https://www.googleapis.com/youtube/v3/playlists?part=snippet&mine=true&maxResults=50",
    { headers: { Authorization: oauth } }
  );
  if (listed.ok) {
    const data = await listed.json();
    const existing = (data.items ?? []).find((p: any) => p.snippet?.title === PLAYLIST_TITLE);
    if (existing?.id) return existing.id;
  }

  // Create playlist
  const created = await fetch(
    "https://www.googleapis.com/youtube/v3/playlists?part=snippet,status",
    {
      method: "POST",
      headers: { Authorization: oauth, "Content-Type": "application/json" },
      body: JSON.stringify({
        snippet: { title: PLAYLIST_TITLE, description: "Private media stored by CloudVault." },
        status: { privacyStatus: "private" },
      }),
    }
  );
  if (!created.ok) throw new Error("Could not create CloudVault playlist");
  const data = await created.json();
  return data.id;
}

/** Add a video to a playlist. */
export async function addToPlaylist(playlistId: string, videoId: string): Promise<void> {
  const token = await getAccessToken();
  const res = await fetch(
    "https://www.googleapis.com/youtube/v3/playlistItems?part=snippet",
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        snippet: {
          playlistId,
          resourceId: { kind: "youtube#video", videoId },
        },
      }),
    }
  );
  if (!res.ok) throw new Error("Could not add video to playlist");
}
