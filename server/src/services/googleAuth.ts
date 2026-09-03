import { google } from "googleapis";
import { env } from "../config.js";

const SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/youtube.upload",
  // Needed to resolve playable stream URLs for the user's own private videos.
  "https://www.googleapis.com/auth/youtube.readonly",
  // Needed to create the private "CloudVault" playlist and add items to it.
  "https://www.googleapis.com/auth/youtube.force-ssl",
];

export function buildAuthOAuthClient() {
  return new google.auth.OAuth2(
    env.GOOGLE_CLIENT_ID,
    env.GOOGLE_CLIENT_SECRET,
    env.GOOGLE_AUTH_REDIRECT_URI
  );
}

export function getGoogleAuthUrl() {
  const oauth = buildAuthOAuthClient();
  return oauth.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: SCOPES,
  });
}

export async function exchangeGoogleAuthCode(
  code: string
): Promise<{ email: string; refreshToken: string; accessToken: string; channelId: string }> {
  const oauth = buildAuthOAuthClient();
  const { tokens } = await oauth.getToken(code);
  oauth.setCredentials(tokens);

  // userinfo.email is the sanctioned way to get the signed-in Google email
  let email = "";
  try {
    const info = await google.oauth2("v2").userinfo.get({ auth: oauth });
    email = info.data.email ?? "";
  } catch {
    // fallback: derive from token payload if available
  }

  // channel id (may be empty if the account has no channel yet)
  let channelId = "";
  try {
    const yt = google.youtube("v3");
    const res = await yt.channels.list({ auth: oauth, part: ["id"], mine: true });
    channelId = res.data.items?.[0]?.id ?? "";
  } catch {
    // not fatal
  }

  return {
    email,
    accessToken: tokens.access_token ?? "",
    refreshToken: tokens.refresh_token ?? "",
    channelId,
  };
}
