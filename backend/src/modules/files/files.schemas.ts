import { z } from "zod";

export const fileMetadataSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().min(1).max(3000),
  category: z.string().min(1).max(120),
  tags: z.string().optional().default(""),
  uploadDate: z.string().optional(),
  extraMetadata: z.string().optional()
});

export const allowedFileMimes = new Set([
  "application/pdf",
  "application/zip",
  "application/x-zip-compressed",
  "application/x-zip",
  "application/vnd.comicbook+zip",
  "application/x-cbz",
  "application/vnd.rar",
  "application/x-rar-compressed",
  "application/x-cbr",
  "application/vnd.comicbook-rar",
  "text/plain",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/octet-stream"
]);

export const allowedCoverMimes = new Set(["image/png", "image/jpeg", "image/webp"]);

export const allowedFileExtensions = new Set([".pdf", ".zip", ".cbz", ".cbr", ".txt", ".doc", ".docx"]);
export const allowedCoverExtensions = new Set([".png", ".jpg", ".jpeg", ".webp"]);
