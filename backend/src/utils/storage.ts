import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { extensionFromMime, sanitizeFilename, safeJoin } from "./filename.js";

export async function ensureStorageDirs(storageRoot: string): Promise<void> {
  await fs.mkdir(path.join(storageRoot, "protected"), { recursive: true });
  await fs.mkdir(path.join(storageRoot, "covers"), { recursive: true });
}

export async function saveBufferToStorage(params: {
  storageRoot: string;
  subdir: "protected" | "covers";
  filename: string;
  mimetype: string;
  buffer: Buffer;
  maxBytes: number;
}): Promise<{ storedFilename: string; relativePath: string; originalFilename: string; bytes: number }> {
  const original = sanitizeFilename(params.filename || "unknown.bin");
  const ext = extensionFromMime(params.mimetype) || path.extname(original);
  const storedFilename = `${randomUUID()}${ext}`;
  const relativePath = `${params.subdir}/${storedFilename}`;
  const absolutePath = safeJoin(params.storageRoot, relativePath);

  const bytes = params.buffer.length;
  if (bytes > params.maxBytes) {
    throw new Error("File too large");
  }

  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, params.buffer);

  return { storedFilename, relativePath, originalFilename: original, bytes };
}
