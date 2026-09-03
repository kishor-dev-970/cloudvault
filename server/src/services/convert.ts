import ffmpeg from "fluent-ffmpeg";
import { promisify } from "util";
import { pipeline } from "stream";
import { unlink, writeFile } from "fs/promises";
import os from "os";
import path from "path";
import { nanoid } from "nanoid";

const streamPipeline = promisify(pipeline);

const IMAGE_MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
};

export function isImageMime(mime: string): boolean {
  return mime.startsWith("image/");
}

export function isVideoMime(mime: string): boolean {
  return mime.startsWith("video/");
}

function extForMime(mime: string): string {
  return IMAGE_MIME_TO_EXT[mime] ?? ".jpg";
}

export async function convertImageToVideo(opts: {
  buffer: Buffer;
  mimeType: string;
  durationSec?: number;
}): Promise<{ videoPath: string; tempImagePath: string; duration: number }> {
  const dir = os.tmpdir();
  const id = nanoid();
  const imagePath = path.join(dir, `cv-image-${id}${extForMime(opts.mimeType)}`);
  const videoPath = path.join(dir, `cv-video-${id}.mp4`);
  const duration = opts.durationSec ?? 5;

  await writeFile(imagePath, opts.buffer);

  await new Promise<void>((resolve, reject) => {
    ffmpeg(imagePath)
      .loop(duration)
      .duration(duration)
      .videoCodec("libx264")
      .audioCodec("aac")
      .size("1920x1080")
      .outputOptions(["-pix_fmt", "yuv420p", "-t", String(duration)])
      .on("end", () => resolve())
      .on("error", (err) => reject(err))
      .save(videoPath);
  });

  return { videoPath, tempImagePath: imagePath, duration };
}

export async function cleanupTemp(...paths: string[]) {
  await Promise.all(
    paths.map((p) =>
      unlink(p).catch(() => {
        /* ignore */
      })
    )
  );
}
