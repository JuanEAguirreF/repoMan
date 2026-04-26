import fs from "node:fs/promises";
import path from "node:path";
import { env } from "../../config/env.js";
import { safeJoin } from "../../utils/filename.js";

const AVATAR_EXTENSIONS = [".png", ".jpg", ".jpeg", ".webp"] as const;
const AVATAR_MIME_BY_EXT: Record<(typeof AVATAR_EXTENSIONS)[number], string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp"
};

function getAvatarRoot() {
  return path.join(env.STORAGE_ROOT, "avatars");
}

function normalizeProfileId(profileId: string): string {
  return String(profileId || "").replace(/[^a-zA-Z0-9_-]/g, "");
}

export async function ensureAvatarDir() {
  await fs.mkdir(getAvatarRoot(), { recursive: true });
}

export async function saveAvatar(params: {
  profileId: string;
  ext: ".png" | ".jpg" | ".jpeg" | ".webp";
  buffer: Buffer<ArrayBufferLike>;
}) {
  await ensureAvatarDir();
  const profileId = normalizeProfileId(params.profileId);
  if (!profileId) throw new Error("Invalid profile id");

  for (const ext of AVATAR_EXTENSIONS) {
    const candidate = safeJoin(getAvatarRoot(), `${profileId}${ext}`);
    await fs.rm(candidate, { force: true });
  }

  const absolutePath = safeJoin(getAvatarRoot(), `${profileId}${params.ext}`);
  await fs.writeFile(absolutePath, params.buffer);
}

export async function findAvatar(profileIdRaw: string): Promise<{
  absolutePath: string;
  mimeType: string;
  mtimeMs: number;
} | null> {
  const profileId = normalizeProfileId(profileIdRaw);
  if (!profileId) return null;

  for (const ext of AVATAR_EXTENSIONS) {
    const absolutePath = safeJoin(getAvatarRoot(), `${profileId}${ext}`);
    try {
      const stat = await fs.stat(absolutePath);
      if (!stat.isFile()) continue;
      return {
        absolutePath,
        mimeType: AVATAR_MIME_BY_EXT[ext],
        mtimeMs: stat.mtimeMs
      };
    } catch {
      // Continue scanning possible extensions.
    }
  }

  return null;
}

export function buildAvatarPublicUrl(profileId: string, mtimeMs?: number): string {
  const safeProfile = normalizeProfileId(profileId);
  const version = Number.isFinite(mtimeMs) ? `?v=${Math.floor(Number(mtimeMs))}` : "";
  return `/api/public/avatars/${safeProfile}${version}`;
}
