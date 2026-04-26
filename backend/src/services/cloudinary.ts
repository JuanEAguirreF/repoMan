import sharp from "sharp";
import { v2 as cloudinary } from "cloudinary";
import { env } from "../config/env.js";
import { setTimeout as sleepTimeout } from "node:timers/promises";

cloudinary.config({
  cloud_name: env.CLOUDINARY_CLOUD_NAME,
  api_key: env.CLOUDINARY_API_KEY,
  api_secret: env.CLOUDINARY_API_SECRET,
  secure: true
});

async function optimizeCoverToAvif(input: Uint8Array): Promise<Uint8Array> {
  const qualities = [56, 48, 40, 34, 28];
  let best = new Uint8Array(0);

  for (const quality of qualities) {
    const outputBuffer = await sharp(input)
      .rotate()
      .resize({
        width: env.COVER_TARGET_MAX_WIDTH,
        withoutEnlargement: true,
        fit: "inside"
      })
      .avif({ quality, effort: 6 })
      .toBuffer();
    const output = new Uint8Array(outputBuffer);

    best = output;
    if (output.length <= env.COVER_TARGET_MAX_BYTES) {
      return output;
    }
  }

  if (best.length > env.COVER_TARGET_MAX_BYTES) {
    throw new Error("Cover image is too heavy after optimization");
  }
  return best;
}

export async function uploadCoverToCloudinary(input: {
  fileBuffer: Uint8Array;
  fileIdHint: string;
}): Promise<{ url: string; bytes: number }> {
  const optimized = await optimizeCoverToAvif(input.fileBuffer);
  const uploadResult = await new Promise<{ secure_url: string }>((resolve, reject) => {
    let settled = false;
    const timeoutMs = 60_000;
    const timeoutSignal = sleepTimeout(timeoutMs).then(() => {
      if (settled) return;
      settled = true;
      reject(new Error("Cloudinary upload timed out"));
    });

    const stream = cloudinary.uploader.upload_stream(
      {
        folder: env.CLOUDINARY_FOLDER,
        public_id: `cover-${input.fileIdHint}`,
        resource_type: "image",
        format: "avif",
        overwrite: true
      },
      (error, result) => {
        if (settled) return;
        settled = true;
        void timeoutSignal;
        if (error || !result) {
          reject(error ?? new Error("Cloudinary upload failed"));
          return;
        }
        resolve({ secure_url: result.secure_url });
      }
    );

    stream.on("error", (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    });

    try {
      stream.end(optimized);
    } catch (error) {
      if (settled) return;
      settled = true;
      reject(error as Error);
    }
  });

  return { url: uploadResult.secure_url, bytes: optimized.length };
}
