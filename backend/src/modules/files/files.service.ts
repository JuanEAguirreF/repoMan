import { FastifyInstance } from "fastify";
import path from "node:path";
import { env } from "../../config/env.js";
import { insertAuditLog } from "../audit/audit.repository.js";
import {
  createFileRecord,
  getFileById,
  getPublicFileById,
  listFilesByOwner,
  listPublicFiles,
  setFileStatus
} from "./files.repository.js";
import {
  allowedCoverExtensions,
  allowedCoverMimes,
  allowedFileExtensions,
  allowedFileMimes,
  fileMetadataSchema
} from "./files.schemas.js";
import { saveBufferToStorage } from "../../utils/storage.js";
import { invalidatePublicCache } from "../public/public.cache.js";
import { uploadCoverToCloudinary } from "../../services/cloudinary.js";

export type UploadedFileInput = {
  filename: string;
  mimetype: string;
  buffer: Buffer<ArrayBufferLike>;
};

function normalizeMimeType(value: string): string {
  return value.toLowerCase().split(";")[0].trim();
}

function slugify(value: string): string {
  const normalized = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || "item";
}

async function buildUniqueFileSlug(fastify: FastifyInstance, title: string): Promise<string> {
  const base = slugify(title);
  type SlugRow = { slug: string | null };
  const { data, error } = await fastify.supabaseAdmin
    .from("files")
    .select("slug")
    .ilike("slug", `${base}%`)
    .limit(500);

  if (error) throw error;

  const slugRows = (data ?? []) as SlugRow[];
  const existing = new Set(slugRows.map((row: SlugRow) => String(row.slug)));
  if (!existing.has(base)) return base;

  let suffix = 2;
  while (existing.has(`${base}-${suffix}`)) {
    suffix += 1;
  }
  return `${base}-${suffix}`;
}

export async function createFileUpload(fastify: FastifyInstance, params: {
  ownerUserId: string;
  metadata: Record<string, string>;
  mainFile?: UploadedFileInput;
  coverFile: UploadedFileInput;
  maxMainFileBytes?: number;
}) {
  const mainFileLimitBytes = params.maxMainFileBytes ?? env.MAX_FILE_SIZE_BYTES;
  const normalizedCoverMime = normalizeMimeType(params.coverFile.mimetype);
  const normalizedMainMime = params.mainFile ? normalizeMimeType(params.mainFile.mimetype) : "";

  const parsedMetadata = fileMetadataSchema.parse({
    title: params.metadata.title,
    description: params.metadata.description,
    category: params.metadata.category,
    contentOrigin: params.metadata.contentOrigin,
    tags: params.metadata.tags,
    uploadDate: params.metadata.uploadDate,
    extraMetadata: params.metadata.extraMetadata
  });

  if (!allowedCoverMimes.has(normalizedCoverMime)) {
    throw new Error("Unsupported cover image type");
  }
  if (params.coverFile.buffer.length > env.MAX_COVER_SIZE_BYTES) {
    throw new Error("Cover image file too large");
  }
  const coverExt = path.extname(params.coverFile.filename || "").toLowerCase();
  if (!allowedCoverExtensions.has(coverExt)) {
    throw new Error("Unsupported cover image extension");
  }

  if (params.mainFile) {
    const fileExt = path.extname(params.mainFile.filename || "").toLowerCase();
    if (!allowedFileExtensions.has(fileExt)) {
      throw new Error(`Unsupported main file extension (${fileExt || "none"})`);
    }
    // Some clients (especially local/browser uploads) send generic octet-stream.
    // In that case we trust the strict extension allow-list already enforced above.
    if (!allowedFileMimes.has(normalizedMainMime)) {
      throw new Error(`Unsupported main file type (${normalizedMainMime || "none"})`);
    }
  }

  const savedMain = params.mainFile
    ? await saveBufferToStorage({
        storageRoot: env.STORAGE_ROOT,
        subdir: "protected",
        filename: params.mainFile.filename,
        mimetype: normalizedMainMime,
        buffer: params.mainFile.buffer,
        maxBytes: mainFileLimitBytes
      })
    : {
        originalFilename: "__no_backup__",
        storedFilename: "__no_backup__",
        relativePath: "__no_backup__",
        bytes: 1
      };
  const uploadedCover = await uploadCoverToCloudinary({
    fileBuffer: params.coverFile.buffer,
    fileIdHint: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  });

  const parsedExtraMetadata = parsedMetadata.extraMetadata ? JSON.parse(parsedMetadata.extraMetadata) : {};
  const uniqueSlug = await buildUniqueFileSlug(fastify, parsedMetadata.title);

  const created = await createFileRecord(fastify, {
    owner_user_id: params.ownerUserId,
    title: parsedMetadata.title,
    slug: uniqueSlug,
    description: parsedMetadata.description,
    category: parsedMetadata.category,
    content_origin: parsedMetadata.contentOrigin,
    tags: parsedMetadata.tags ? parsedMetadata.tags.split(",").map((t) => t.trim()).filter(Boolean) : [],
    original_filename: savedMain.originalFilename,
    stored_filename: savedMain.storedFilename,
    file_path: savedMain.relativePath,
    cover_image_path: uploadedCover.url,
    mime_type: params.mainFile ? normalizedMainMime : "application/x-manga-metadata-only",
    file_size_bytes: savedMain.bytes,
    has_backup: Boolean(params.mainFile),
    status: "active",
    is_public: true,
    allow_download: false,
    published_at: new Date().toISOString(),
    extra_metadata: {
      ...parsedExtraMetadata,
      content_origin: parsedMetadata.contentOrigin,
      upload_date: parsedMetadata.uploadDate ?? null
    }
  });

  await insertAuditLog(fastify, {
    actorUserId: params.ownerUserId,
    action: "file.uploaded",
    targetType: "file",
    targetId: String(created.id),
    metadata: { title: created.title, mimeType: created.mime_type, hasBackup: Boolean(params.mainFile) }
  });

  invalidatePublicCache();

  return created;
}

export async function getMyFiles(fastify: FastifyInstance, ownerUserId: string) {
  return listFilesByOwner(fastify, ownerUserId);
}

export async function getPublicCatalog(fastify: FastifyInstance) {
  return listPublicFiles(fastify);
}

export async function getPublicCatalogDetail(fastify: FastifyInstance, id: string) {
  return getPublicFileById(fastify, id);
}

export async function markPendingDeletion(fastify: FastifyInstance, fileId: string) {
  await setFileStatus(fastify, fileId, "pending_deletion", null);
  invalidatePublicCache();
}

export async function markDeleted(fastify: FastifyInstance, fileId: string) {
  await setFileStatus(fastify, fileId, "deleted", new Date().toISOString());
  invalidatePublicCache();
}

export async function restoreActive(fastify: FastifyInstance, fileId: string) {
  await setFileStatus(fastify, fileId, "active", null);
  invalidatePublicCache();
}

export async function fetchFileById(fastify: FastifyInstance, fileId: string) {
  return getFileById(fastify, fileId);
}
