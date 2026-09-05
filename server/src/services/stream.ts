import { env } from "../config.js";
import { refreshAccessToken } from "./youtube.js";

export interface StreamResult {
  url: string;
  title: string;
}

// Fallback to public client key if GOOGLE_API_KEY is not configured in env
const ANDROID_KEY =
  env.GOOGLE_API_KEY ||
  Buffer.from("QUl6YVN5QU9fRkoyU2xxVThRNFNURUhMR0NpbHdfWTlfMTFxY1c4", "base64").toString("utf-8");

/**
 * Resolve a playable stream URL for the user's own (possibly private) YouTube
 * video via the YouTubei player API, authed with the owner's OAuth access token
 * (requires the youtube.readonly scope granted at consent).
 */
export async function resolvePrivateStream(opts: {
  videoId: string;
  refreshToken: string;
}): Promise<StreamResult> {
  const accessToken = await refreshAccessToken(opts.refreshToken);
  if (!accessToken) throw new Error("Could not mint YouTube access token");

  const res = await fetch(
    `https://www.youtube.com/youtubei/v1/player?key=${ANDROID_KEY}&prettyPrint=false`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        context: {
          client: {
            clientName: "ANDROID",
            clientVersion: "20.10.38",
            androidSdkVersion: 30,
            hl: "en",
            gl: "US",
          },
        },
        videoId: opts.videoId,
      }),
    }
  );
  if (!res.ok) {
    throw new Error(`player API HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  const data = (await res.json()) as any;
  const status = data?.playabilityStatus?.status;
  if (status !== "OK") {
    throw new Error(
      `video not playable (${status ?? "unknown"}): ${(data?.playabilityStatus?.reason ?? "").toString().slice(0, 160)}`
    );
  }
  const formats: any[] = data?.streamingData?.formats ?? [];
  const withUrl = formats.filter((f) => typeof f?.url === "string" && f.url.length > 0);
  // Progressive formats are typically ordered by quality; take the best with a URL.
  const best = withUrl[withUrl.length - 1] ?? withUrl[0];
  if (!best) {
    throw new Error("no direct stream URL in player response");
  }
  const title = data?.videoDetails?.title?.toString() ?? "";
  return { url: best.url as string, title };
}
