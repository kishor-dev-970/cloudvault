import { Router } from "express";
import { prisma } from "../db/client.js";
import { requireAuth, type AuthedRequest } from "../middleware/auth.js";
import { getAuthUrl, exchangeCode } from "../services/youtube.js";

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

    res.json({ connected: true, channelId, connectionId: connection.id });
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
