import path from "node:path";

const SAFE = /[^a-zA-Z0-9._-]/g;

export function sanitizeFilename(input: string): string {
  return path.basename(input).replace(SAFE, "_");
}

export function safeJoin(baseDir: string, relativePath: string): string {
  const resolved = path.resolve(baseDir, relativePath);
  const normalizedBase = `${path.resolve(baseDir)}${path.sep}`;
  const normalizedResolved = `${resolved}${path.sep}`;
  if (!normalizedResolved.startsWith(normalizedBase)) {
    throw new Error("Invalid path");
  }
  return resolved;
}

export function extensionFromMime(mime: string): string {
  const map: Record<string, string> = {
    "application/pdf": ".pdf",
    "application/zip": ".zip",
    "application/vnd.comicbook+zip": ".cbz",
    "application/x-cbz": ".cbz",
    "application/vnd.rar": ".cbr",
    "application/x-rar-compressed": ".cbr",
    "application/x-cbr": ".cbr",
    "application/vnd.comicbook-rar": ".cbr",
    "text/plain": ".txt",
    "application/msword": ".doc",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/webp": ".webp"
  };
  return map[mime] ?? "";
}
