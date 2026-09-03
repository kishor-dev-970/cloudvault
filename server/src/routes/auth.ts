import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../db/client.js";
import { signToken } from "../middleware/auth.js";
import { getGoogleAuthUrl, exchangeGoogleAuthCode } from "../services/googleAuth.js";
import { env } from "../config.js";

export const authRouter = Router();

const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

authRouter.post("/signup", async (req, res) => {
  const parsed = signupSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
    return;
  }
  const { email, password } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    res.status(409).json({ error: "Email already registered" });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: { email, passwordHash },
  });

  const token = await signToken({ id: user.id, email: user.email });
  res.status(201).json({ token, user: { id: user.id, email: user.email } });
});

authRouter.post("/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }
  const { email, password } = parsed.data;

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.passwordHash) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  const token = await signToken({ id: user.id, email: user.email });
  res.json({ token, user: { id: user.id, email: user.email } });
});

authRouter.get("/google", (_req, res) => {
  res.json({ authUrl: getGoogleAuthUrl() });
});

authRouter.get("/google/callback", async (req, res) => {
  const { code, state } = req.query;
  if (!code || typeof code !== "string") {
    res.status(400).json({ error: "Missing OAuth code" });
    return;
  }

  try {
    const { email, refreshToken, accessToken, channelId } = await exchangeGoogleAuthCode(code);

    if (!email) {
      res.status(400).json({ error: "Could not determine Google account email" });
      return;
    }

    let user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      user = await prisma.user.create({ data: { email } });
    }

    const token = await signToken({ id: user.id, email: user.email });

    // Save the YouTube connection (always create, even if refreshToken is absent;
    // the initial accessToken is enough for playlist/playback with the new scopes)
    await prisma.connection.upsert({
      where: { userId: user.id },
      update: {
        provider: "youtube",
        accessToken,
        refreshToken: refreshToken || undefined,
        externalAccountId: channelId || email,
        tokenExpiresAt: new Date(Date.now() + 3600 * 1000),
      },
      create: {
        userId: user.id,
        provider: "youtube",
        accessToken,
        refreshToken,
        externalAccountId: channelId || email,
        tokenExpiresAt: new Date(Date.now() + 3600 * 1000),
      },
    });

    // Expo Go strips any path/query/fragment from the exp:// deep link when handing
    // back from the browser, so we cannot deliver the token through the URL. Instead we
    // store a short-lived pending session server-side and have the app fetch it.
    const pending = {
      token,
      email: user.email,
      connected: refreshToken ? "1" : "0",
      channelId: channelId ?? null,
      createdAt: Date.now(),
    };
    lastPendingSession = pending;

    const redirectTarget = state && typeof state === "string" ? state : env.EXPO_REDIRECT_URL;
    res.redirect(redirectTarget);
  } catch (err) {
    const redirectTarget =
      state && typeof state === "string" ? state : env.EXPO_REDIRECT_URL;
    const params = new URLSearchParams({ error: String(err) });
    res.redirect(`${redirectTarget}?${params.toString()}`);
  }
});

// In-memory placeholder for the most recent OAuth result. The app fetches this after
// being bounced back to pick up the token (Expo Go drops deep-link payloads).
let lastPendingSession: {
  token: string;
  email: string;
  connected: string;
  channelId: string | null;
  createdAt: number;
} | null = null;

authRouter.get("/pending-session", (_req, res) => {
  const fresh = lastPendingSession && Date.now() - lastPendingSession.createdAt < 60_000;
  if (!fresh || !lastPendingSession) {
    res.status(404).json({ error: "No pending sign-in" });
    return;
  }
  const s = lastPendingSession;
  const body: Record<string, unknown> = {
    token: s.token,
    email: s.email,
    connected: s.connected === "1",
  };
  if (s.channelId) body.channelId = s.channelId;
  res.json(body);
});
