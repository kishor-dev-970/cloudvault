import { Router } from "express";
import { prisma } from "../db/client.js";
import { requireAuth, type AuthedRequest } from "../middleware/auth.js";
import { getAuthUrl, exchangeCode, refreshAccessToken } from "../services/youtube.js";

export const connectRouter = Router();

connectRouter.get("/youtube", requireAuth, (req, res) => {
  res.json({ authUrl: getAuthUrl() });
});

connectRouter.post("/youtube/callback", requireAuth, async (req, res) => {
  const authReq = req as AuthedRequest;
  const user = authReq.user!;
  const { code } = req.body ?? {};

  if (!code) {
    res.status(400).json({ error: "Missing OAuth code" });
    return;
  }

  try {
    const { accessToken, refreshToken, channelId } = await exchangeCode(code);

    const connection = await prisma.connection.upsert({
      where: { userId: user.id },
      update: {
        provider: "youtube",
        accessToken,
        refreshToken,
        externalAccountId: channelId,
        tokenExpiresAt: new Date(Date.now() + 3600 * 1000),
      },
      create: {
        userId: user.id,
        provider: "youtube",
        accessToken,
        refreshToken,
        externalAccountId: channelId,
        tokenExpiresAt: new Date(Date.now() + 3600 * 1000),
      },
    });

    res.json({ connected: true, channelId, connectionId: connection.id, refreshToken });
  } catch (err) {
    res.status(500).json({ error: "OAuth exchange failed", detail: String(err) });
  }
});

connectRouter.get("/youtube/status", requireAuth, async (req, res) => {
  const authReq = req as AuthedRequest;
  const user = authReq.user!;
  const connection = await prisma.connection.findUnique({
    where: { userId: user.id },
  });
  res.json({ connected: Boolean(connection), channelId: connection?.externalAccountId });
});

/**
 * Silent reconnect: the app stores the YouTube refresh token locally so that
 * when the server's ephemeral DB is wiped (Render free tier) the client can
 * silently re-create the Connection row without making the user re-authenticate.
 */
connectRouter.post("/youtube/reconnect", requireAuth, async (req, res) => {
  const authReq = req as AuthedRequest;
  const user = authReq.user!;
  const { refreshToken, channelId } = req.body ?? {};

  if (typeof refreshToken !== "string" || !refreshToken) {
    res.status(400).json({ error: "Missing refresh token" });
    return;
  }

  try {
    // Validate the refresh token by refreshing the access token.
    const accessToken = await refreshAccessToken(refreshToken);

    const connection = await prisma.connection.upsert({
      where: { userId: user.id },
      update: {
        provider: "youtube",
        accessToken,
        refreshToken,
        externalAccountId: channelId || undefined,
        tokenExpiresAt: new Date(Date.now() + 3600 * 1000),
      },
      create: {
        userId: user.id,
        provider: "youtube",
        accessToken,
        refreshToken,
        externalAccountId: channelId || "",
        tokenExpiresAt: new Date(Date.now() + 3600 * 1000),
      },
    });

    res.json({ connected: true, channelId: connection.externalAccountId });
  } catch (err) {
    console.error(`[reconnect] failed for user ${user.id}:`, err);
    res.status(500).json({ error: "Reconnect failed — refresh token may be invalid" });
  }
});
