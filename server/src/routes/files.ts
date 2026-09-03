import { Router, raw, type Response } from "express";
import multer from "multer";
import os from "os";
import path from "path";
import { promises as fs } from "fs";
import { nanoid } from "nanoid";
import { prisma } from "../db/client.js";
import { requireAuth, type AuthedRequest } from "../middleware/auth.js";
import {
  uploadPrivateVideo,
  getVideoThumbnail,
  refreshAccessToken,
  getOrCreateCloudVaultPlaylist,
  addVideoToPlaylist,
  createResumableUploadSession,
} from "../services/youtube.js";
import {
  isImageMime,
  isVideoMime,
  convertImageToVideo,
  cleanupTemp,
} from "../services/convert.js";
import { resolvePrivateStream } from "../services/stream.js";

export const filesRouter = Router();

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 512 * 1024 * 1024 } });

filesRouter.post("/upload", requireAuth, upload.single("file"), async (req, res) => {
  const authReq = req as AuthedRequest;
  const user = authReq.user!;

  if (!req.file) {
    res.status(400).json({ error: "No file uploaded" });
    return;
  }

  const bodyMime = typeof req.body?.mimeType === "string" ? req.body.mimeType.trim() : "";
  const looksLikeMime = /^[\w.+-]+\/[\w.+-]+$/.test(bodyMime);
  // Prefer the client-sent mime type: React Native Blob parts often carry an
  // empty/wrong Content-Type, so the app sends the real one as a form field.
  const mimeType = (looksLikeMime ? bodyMime : req.file.mimetype) || "application/octet-stream";

  await processBufferUpload(
    {
      buffer: req.file.buffer,
      originalName: req.file.originalname,
      mimeType,
      size: req.file.size,
      userId: user.id,
    },
    res
  );
});

// Raw binary upload: same processing, but the body is the file bytes (no multipart).
// Lets the mobile app POST a Blob directly, avoiding FormData serialization that
// blows up JS memory on large files.
filesRouter.post(
  "/upload-binary",
  requireAuth,
  raw({ type: "*/*", limit: "512mb" }),
  async (req, res) => {
    const authReq = req as AuthedRequest;
    const user = authReq.user!;

    const buffer = req.body as Buffer;
    if (!buffer || !Buffer.isBuffer(buffer) || buffer.length === 0) {
      res.status(400).json({ error: "No file uploaded" });
      return;
    }

    let originalName = "upload.bin";
    try {
      const rawName = req.header("x-filename") || "";
      if (rawName) originalName = decodeURIComponent(rawName).slice(0, 200);
    } catch {
      /* keep default */
    }
    const headerMime = (req.header("x-mime-type") || "").trim().split(";")[0].trim();
    const looksLikeMime = /^[\w.+-]+\/[\w.+-]+$/.test(headerMime);
    const mimeType = looksLikeMime ? headerMime : "application/octet-stream";

    await processBufferUpload(
      { buffer, originalName, mimeType, size: buffer.length, userId: user.id },
      res
    );
  }
);

// Chunked upload for large files: the mobile app streams the file in ~4MB base64
// chunks (its only reliable way to read big files). Non-final chunks are appended
// to a temp part file; the final chunk triggers normal processing with NDJSON
// progress streamed back on that same response.
filesRouter.post("/chunk", requireAuth, async (req, res) => {
  const authReq = req as AuthedRequest;
  const user = authReq.user!;

  const { uploadId, index, data, last, filename, mimeType } = req.body ?? {};
  if (
    typeof uploadId !== "string" ||
    !/^[A-Za-z0-9_-]{1,64}$/.test(uploadId) ||
    !Number.isInteger(index) ||
    index < 0 ||
    typeof data !== "string" ||
    typeof last !== "boolean"
  ) {
    res.status(400).json({ error: "Invalid chunk" });
    return;
  }

  const partPath = path.join(os.tmpdir(), `cv-chunk-${uploadId}.part`);
  try {
    if (index === 0) {
      await fs.unlink(partPath).catch(() => {});
    }
    if (data.length > 0) {
      await fs.appendFile(partPath, Buffer.from(data, "base64"));
    }
  } catch (err) {
    res.status(500).json({ error: "Could not store chunk", detail: String(err) });
    return;
  }

  if (!last) {
    res.json({ received: true, index });
    return;
  }

  let statSize = 0;
  try {
    statSize = (await fs.stat(partPath)).size;
  } catch (err) {
    res.status(400).json({ error: "Upload incomplete, missing chunks" });
    return;
  }
  if (statSize === 0) {
    await fs.unlink(partPath).catch(() => {});
    res.status(400).json({ error: "Empty upload" });
    return;
  }

  const headerMime = typeof mimeType === "string" ? mimeType.trim().split(";")[0].trim() : "";
  const looksLikeMime = /^[\w.+-]+\/[\w.+-]+$/.test(headerMime);
  const finalMime = looksLikeMime ? headerMime : "application/octet-stream";
  let originalName = "upload.bin";
  try {
    if (typeof filename === "string" && filename) {
      originalName = decodeURIComponent(filename).slice(0, 200);
    }
  } catch {
    /* keep default */
  }

  // Videos stream straight from the part file (no multi-GB RAM copy).
  // Images are small: read into memory for conversion as before.
  const isVideo = isVideoMime(finalMime);
  let buffer: Buffer | null = null;
  if (!isVideo) {
    try {
      buffer = await fs.readFile(partPath);
    } catch (err) {
      res.status(400).json({ error: "Upload incomplete, missing chunks" });
      return;
    }
  }

  try {
    await processBufferUpload(
      {
        buffer,
        originalName,
        mimeType: finalMime,
        size: statSize,
        userId: user.id,
        videoFilePath: isVideo ? partPath : undefined,
      },
      res
    );
  } finally {
    // processBufferUpload's cleanup deletes videoPath (== partPath for video).
    // Delete again harmlessly in case it never ran (errors before try).
    await fs.unlink(partPath).catch(() => {});
  }
});
async function processBufferUpload(
  input: {
    buffer: Buffer | null;
    originalName: string;
    mimeType: string;
    size: number;
    userId: string;
    // When the file already sits on disk (e.g. reassembled chunks), pass its path
    // so videos stream straight to YouTube without another full-size copy in RAM.
    videoFilePath?: string;
  },
  res: Response
) {
  const { buffer, originalName, mimeType, size, userId, videoFilePath } = input;

  const connection = await prisma.connection.findUnique({ where: { userId } });
  if (!connection) {
    res.status(400).json({ error: "YouTube not connected" });
    return;
  }

  let mediaKind: "video" | "image";
  if (isVideoMime(mimeType)) mediaKind = "video";
  else if (isImageMime(mimeType)) mediaKind = "image";
  else {
    res.status(400).json({ error: `Unsupported file type: ${mimeType}` });
    return;
  }

  const file = await prisma.file.create({
    data: {
      userId,
      originalName,
      mimeType,
      sizeBytes: size,
      mediaKind,
      externalId: "",
      status: "uploading",
    },
  });

  res.setHeader("Content-Type", "application/json");
  res.write(JSON.stringify({ fileId: file.id, status: "uploading", mediaKind }) + "\n");

  // YouTube titles are limited to 100 chars; truncate long original names.
  const title = `CloudVault - ${file.originalName}`.slice(0, 100);

  let videoPath: string | undefined;
  let tempImagePath: string | undefined;
  let externalId = "";

  try {
    let uploadMime = mimeType;
    if (mediaKind === "video") {
      if (videoFilePath) {
        // Already on disk (reassembled chunks): stream straight to YouTube.
        videoPath = videoFilePath;
      } else {
        // For direct video upload we could stream straight through, but express
        // memoryStorage already gave us a buffer. Write to temp for resumable upload.
        videoPath = path.join(os.tmpdir(), `cv-upload-${nanoid()}.mp4`);
        await fs.writeFile(videoPath, buffer!);
      }
      uploadMime = mimeType;
    } else {
      if (!buffer) throw new Error("Missing image data");
      const converted = await convertImageToVideo({
        buffer,
        mimeType,
      });
      videoPath = converted.videoPath;
      tempImagePath = converted.tempImagePath;
      uploadMime = "video/mp4";
    }

    let accessToken = connection.accessToken;
    try {
      accessToken = await refreshAccessToken(connection.refreshToken);
    } catch {
      // fall back to stored access token
    }

    let last = 0;
    externalId = await uploadPrivateVideo({
      refreshToken: connection.refreshToken,
      filePath: videoPath,
      title,
      description: `CloudVault private file: ${file.originalName}`,
      mimeType: uploadMime,
      onProgress: (p) => {
        const pct = Math.round((p.bytesWritten / p.total) * 100);
        if (pct - last >= 10) {
          last = pct;
          res.write(JSON.stringify({ fileId: file.id, status: "uploading", progress: pct }) + "\n");
        }
      },
    });

    const thumbnailUrl = await getVideoThumbnail(externalId);

    await prisma.file.update({
      where: { id: file.id },
      data: { externalId, thumbnailUrl, status: "uploaded" },
    });

    // File the video in the private "CloudVault" playlist (best-effort: a
    // playlist failure must not fail an otherwise successful upload).
    try {
      let playlistId = connection.playlistId;
      if (!playlistId) {
        playlistId = await getOrCreateCloudVaultPlaylist(connection.refreshToken);
        await prisma.connection.update({
          where: { userId },
          data: { playlistId },
        });
      }
      await addVideoToPlaylist(connection.refreshToken, playlistId, externalId);
    } catch (playlistErr) {
      console.error(`[upload] playlist filing failed for ${externalId}:`, playlistErr);
    }

    res.write(JSON.stringify({ fileId: file.id, status: "uploaded", externalId, thumbnailUrl }));
  } catch (err) {
    console.error(`[upload] failed for file ${file.id} (${file.originalName}):`, err);
    await prisma.file.update({
      where: { id: file.id },
      data: { status: "failed" },
    });
    res.write(JSON.stringify({ fileId: file.id, status: "failed", error: String(err) }));
  } finally {
    if (videoPath) await cleanupTemp(videoPath);
    if (tempImagePath) await cleanupTemp(tempImagePath);
    res.end();
  }
}

// Direct-to-YouTube resumable upload: the server ONLY authorizes a session and
// returns a Google upload URI + short-lived access token. The phone then PUTs the
// media bytes straight to YouTube, so large files never touch the app server.
filesRouter.post("/upload-session", requireAuth, async (req, res) => {
  const authReq = req as AuthedRequest;
  const user = authReq.user!;

  const connection = await prisma.connection.findUnique({ where: { userId: user.id } });
  if (!connection || !connection.refreshToken) {
    res.status(400).json({ error: "YouTube not connected" });
    return;
  }

  const { name, mimeType, size } = req.body ?? {};
  if (
    typeof name !== "string" ||
    typeof mimeType !== "string" ||
    !Number.isInteger(size) ||
    size <= 0
  ) {
    res.status(400).json({ error: "Invalid upload session request" });
    return;
  }

  const title = `CloudVault - ${name}`.slice(0, 100);
  try {
    const { uploadURI, accessToken } = await createResumableUploadSession({
      refreshToken: connection.refreshToken,
      title,
      description: `CloudVault private file: ${name}`,
      mimeType,
      sizeBytes: size,
    });
    res.json({ uploadURI, accessToken, expiresIn: 3600 });
  } catch (err) {
    console.error(`[upload] session failed for user ${user.id}:`, err);
    res.status(502).json({ error: "Could not start upload session", detail: String(err) });
  }
});

// Called by the app AFTER the media has been PUT directly to YouTube, to record
// the File row, thumbnail, and file it into the private CloudVault playlist.
filesRouter.post("/complete", requireAuth, async (req, res) => {
  const authReq = req as AuthedRequest;
  const user = authReq.user!;

  const { videoId, name, mimeType, size } = req.body ?? {};
  if (
    typeof videoId !== "string" ||
    !videoId ||
    typeof name !== "string" ||
    typeof mimeType !== "string"
  ) {
    res.status(400).json({ error: "Invalid completion payload" });
    return;
  }

  const connection = await prisma.connection.findUnique({ where: { userId: user.id } });
  if (!connection || !connection.refreshToken) {
    res.status(400).json({ error: "YouTube not connected" });
    return;
  }

  const mediaKind: "video" | "image" = isVideoMime(mimeType) ? "video" : "image";
  const sizeBytes = Number.isInteger(size) && size > 0 ? size : 0;

  try {
    const file = await prisma.file.create({
      data: {
        userId: user.id,
        originalName: name,
        mimeType,
        sizeBytes,
        mediaKind,
        externalId: videoId,
        thumbnailUrl: await getVideoThumbnail(videoId),
        status: "uploaded",
      },
    });

    // Best-effort: file into the private "CloudVault" playlist (must not fail the upload).
    try {
      let playlistId = connection.playlistId;
      if (!playlistId) {
        playlistId = await getOrCreateCloudVaultPlaylist(connection.refreshToken);
        await prisma.connection.update({ where: { userId: user.id }, data: { playlistId } });
      }
      await addVideoToPlaylist(connection.refreshToken, playlistId, videoId);
    } catch (playlistErr) {
      console.error(`[upload] playlist filing failed for ${videoId}:`, playlistErr);
    }

    res.json({
      fileId: file.id,
      status: "uploaded",
      externalId: videoId,
      thumbnailUrl: file.thumbnailUrl,
    });
  } catch (err) {
    console.error(`[upload] complete failed for user ${user.id}:`, err);
    res.status(500).json({ error: "Could not record upload", detail: String(err) });
  }
});

filesRouter.get("/", requireAuth, async (req, res) => {
  const authReq = req as AuthedRequest;
  const user = authReq.user!;
  const files = await prisma.file.findMany({
    // Failed attempts are clutter, not media: keep them out of the library.
    // (They stay in the DB for debugging; a retry creates a fresh record.)
    where: { userId: user.id, status: { not: "failed" } },
    orderBy: { createdAt: "desc" },
  });
  res.json({ files });
});

filesRouter.get("/:id/stream", requireAuth, async (req, res) => {
  const authReq = req as AuthedRequest;
  const user = authReq.user!;

  const file = await prisma.file.findFirst({
    where: { id: req.params.id, userId: user.id },
  });
  if (!file) {
    res.status(404).json({ error: "File not found" });
    return;
  }

  const connection = await prisma.connection.findUnique({ where: { userId: user.id } });
  if (!connection || !connection.refreshToken) {
    res.status(400).json({ error: "YouTube not connected" });
    return;
  }

  try {
    const { url } = await resolvePrivateStream({
      videoId: file.externalId,
      refreshToken: connection.refreshToken,
    });
    if (!url) {
      res.status(502).json({ error: "Could not resolve stream URL" });
      return;
    }
    res.json({ url, fileId: file.id, externalId: file.externalId });
  } catch (err) {
    console.error(`[stream] failed for video ${req.params.id}:`, err);
    res.status(502).json({ error: "Stream resolution failed", detail: String(err) });
  }
});
