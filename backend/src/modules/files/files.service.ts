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

export async function createFileUpload(fastify: FastifyInstance, params: {
  ownerUserId: string;
  metadata: Record<string, string>;
  mainFile?: UploadedFileInput;
  coverFile: UploadedFileInput;
}) {
  const parsedMetadata = fileMetadataSchema.parse({
    title: params.metadata.title,
    description: params.metadata.description,
    category: params.metadata.category,
    tags: params.metadata.tags,
    uploadDate: params.metadata.uploadDate,
    extraMetadata: params.metadata.extraMetadata
  });

  if (!allowedCoverMimes.has(params.coverFile.mimetype)) {
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
    if (!allowedFileMimes.has(params.mainFile.mimetype)) {
      throw new Error("Unsupported main file type");
    }
    const fileExt = path.extname(params.mainFile.filename || "").toLowerCase();
    if (!allowedFileExtensions.has(fileExt)) {
      throw new Error("Unsupported main file extension");
    }
    if (params.mainFile.mimetype === "application/octet-stream" && ![".cbz", ".cbr"].includes(fileExt)) {
      throw new Error("Unsupported main file type");
    }
  }

  const savedMain = params.mainFile
    ? await saveBufferToStorage({
        storageRoot: env.STORAGE_ROOT,
        subdir: "protected",
        filename: params.mainFile.filename,
        mimetype: params.mainFile.mimetype,
        buffer: params.mainFile.buffer,
        maxBytes: env.MAX_FILE_SIZE_BYTES
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

  const created = await createFileRecord(fastify, {
    owner_user_id: params.ownerUserId,
    title: parsedMetadata.title,
    description: parsedMetadata.description,
    category: parsedMetadata.category,
    tags: parsedMetadata.tags ? parsedMetadata.tags.split(",").map((t) => t.trim()).filter(Boolean) : [],
    original_filename: savedMain.originalFilename,
    stored_filename: savedMain.storedFilename,
    file_path: savedMain.relativePath,
    cover_image_path: uploadedCover.url,
    mime_type: params.mainFile?.mimetype ?? "application/x-manga-metadata-only",
    file_size_bytes: savedMain.bytes,
    has_backup: Boolean(params.mainFile),
    status: "active",
    is_public: true,
    allow_download: false,
    published_at: new Date().toISOString(),
    extra_metadata: {
      ...parsedExtraMetadata,
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
