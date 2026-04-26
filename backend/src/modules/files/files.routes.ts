import { FastifyPluginAsync } from "fastify";
import { MultipartFile, MultipartValue } from "@fastify/multipart";
import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { env } from "../../config/env.js";
import { requireAuth, requireRole } from "../auth/auth.middleware.js";
import { createFileUpload, fetchFileById, getMyFiles, resubmitForPublicationReview, UploadedFileInput } from "./files.service.js";
import { getConfiguredMaxFileSizeBytes } from "../admin/system-settings.repository.js";
import { insertAuditLog } from "../audit/audit.repository.js";
import { safeJoin } from "../../utils/filename.js";

type ParsedForm = {
  fields: Record<string, string>;
  files: Record<string, UploadedFileInput>;
};

type ChunkSession = {
  id: string;
  ownerUserId: string;
  filename: string;
  mimetype: string;
  expectedSize: number;
  chunkSize: number;
  totalChunks: number;
  nextChunkIndex: number;
  uploadedBytes: number;
  createdAt: string;
};

const MAX_CHUNK_SIZE = 10 * 1024 * 1024;
const DEFAULT_CHUNK_SIZE = 8 * 1024 * 1024;
const MIN_CHUNK_SIZE = 1 * 1024 * 1024;
const CHUNK_SESSION_TTL_MS = Math.max(5, env.CHUNK_UPLOAD_SESSION_TTL_MINUTES) * 60 * 1000;
const CLEANUP_COOLDOWN_MS = 5 * 60 * 1000;

function getChunkRoot() {
  return path.join(env.STORAGE_ROOT, "chunked-main");
}

function sessionMetaPath(uploadId: string) {
  return safeJoin(getChunkRoot(), `${uploadId}.json`);
}

function sessionFilePath(uploadId: string) {
  return safeJoin(getChunkRoot(), `${uploadId}.bin`);
}

async function readRequestBodyToBuffer(request: any, maxBytes: number): Promise<Buffer<ArrayBufferLike>> {
  if (Buffer.isBuffer(request.body)) {
    if (request.body.length > maxBytes) {
      throw new Error(`Chunk exceeded ${Math.floor(maxBytes / 1024 / 1024)} MB`);
    }
    return request.body;
  }
  if (request.body instanceof Uint8Array) {
    const bodyBuffer = Buffer.from(request.body);
    if (bodyBuffer.length > maxBytes) {
      throw new Error(`Chunk exceeded ${Math.floor(maxBytes / 1024 / 1024)} MB`);
    }
    return bodyBuffer;
  }

  const chunks: Buffer<ArrayBufferLike>[] = [];
  let size = 0;
  for await (const chunk of request.raw) {
    const bufferChunk = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += bufferChunk.length;
    if (size > maxBytes) {
      throw new Error(`Chunk exceeded ${Math.floor(maxBytes / 1024 / 1024)} MB`);
    }
    chunks.push(bufferChunk);
  }
  return Buffer.concat(chunks);
}

async function loadChunkSession(uploadId: string): Promise<ChunkSession> {
  const raw = await fs.readFile(sessionMetaPath(uploadId), "utf-8");
  return JSON.parse(raw) as ChunkSession;
}

async function saveChunkSession(session: ChunkSession): Promise<void> {
  await fs.writeFile(sessionMetaPath(session.id), JSON.stringify(session), "utf-8");
}

async function removeChunkSession(uploadId: string): Promise<void> {
  await Promise.allSettled([fs.unlink(sessionMetaPath(uploadId)), fs.unlink(sessionFilePath(uploadId))]);
}

function hasExpired(createdAt: string): boolean {
  const created = Date.parse(createdAt);
  if (Number.isNaN(created)) return true;
  return Date.now() - created > CHUNK_SESSION_TTL_MS;
}

async function cleanupExpiredChunkSessions(): Promise<void> {
  await fs.mkdir(getChunkRoot(), { recursive: true });
  const entries = await fs.readdir(getChunkRoot(), { withFileTypes: true });
  const jsonBaseNames = new Set<string>();

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    const base = entry.name.slice(0, -5);
    jsonBaseNames.add(base);
    try {
      const raw = await fs.readFile(sessionMetaPath(base), "utf-8");
      const session = JSON.parse(raw) as ChunkSession;
      if (hasExpired(session.createdAt)) {
        await removeChunkSession(base);
      }
    } catch {
      await removeChunkSession(base);
    }
  }

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".bin")) continue;
    const base = entry.name.slice(0, -4);
    if (jsonBaseNames.has(base)) continue;
    try {
      const fullPath = safeJoin(getChunkRoot(), entry.name);
      const stat = await fs.stat(fullPath);
      if (Date.now() - stat.mtimeMs > CHUNK_SESSION_TTL_MS) {
        await fs.unlink(fullPath);
      }
    } catch {
      // Ignore stat/unlink race
    }
  }
}

async function parseMultipartForm(request: any, maxFileSizeBytes: number): Promise<ParsedForm> {
  const fields: Record<string, string> = {};
  const files: Record<string, UploadedFileInput> = {};

  const effectiveLimit = Math.max(maxFileSizeBytes, env.MAX_COVER_SIZE_BYTES);
  const parts = request.parts({
    limits: {
      fileSize: effectiveLimit,
      files: 2
    }
  });

  async function readPartToBuffer(filePart: MultipartFile, maxBytes: number): Promise<Buffer<ArrayBufferLike>> {
    const chunks: Buffer<ArrayBufferLike>[] = [];
    let size = 0;
    for await (const chunk of filePart.file) {
      const bufferChunk = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += bufferChunk.length;
      if (size > maxBytes) {
        throw new Error(`File "${filePart.filename || filePart.fieldname}" exceeded ${Math.floor(maxBytes / 1024 / 1024)} MB limit`);
      }
      chunks.push(bufferChunk);
    }
    return Buffer.concat(chunks);
  }

  for await (const part of parts) {
    if (part.type === "file") {
      const filePart = part as MultipartFile;
      const perFileLimit = filePart.fieldname === "coverImage" ? env.MAX_COVER_SIZE_BYTES : maxFileSizeBytes;
      const buffer = await readPartToBuffer(filePart, perFileLimit);
      const hasFilename = typeof filePart.filename === "string" && filePart.filename.trim().length > 0;
      if (!hasFilename || buffer.length === 0) {
        continue;
      }
      files[part.fieldname] = {
        filename: filePart.filename || "unknown.bin",
        mimetype: filePart.mimetype,
        buffer
      };
    } else {
      fields[part.fieldname] = (part as MultipartValue<string>).value;
    }
  }

  return { fields, files };
}

export const filesRoutes: FastifyPluginAsync = async (fastify) => {
  let lastCleanupAt = 0;
  let cleanupInFlight: Promise<void> | null = null;

  const maybeRunChunkCleanup = async () => {
    const now = Date.now();
    if (now - lastCleanupAt < CLEANUP_COOLDOWN_MS) return;
    if (cleanupInFlight) return cleanupInFlight;
    cleanupInFlight = cleanupExpiredChunkSessions()
      .catch((error) => {
        fastify.log.warn({ error }, "Chunk cleanup failed");
      })
      .finally(() => {
        lastCleanupAt = Date.now();
        cleanupInFlight = null;
      });
    return cleanupInFlight;
  };

  await maybeRunChunkCleanup();

  fastify.post(
    "/chunks/init",
    { preHandler: [requireAuth, requireRole("uploader", "super_admin")] },
    async (request, reply) => {
      try {
        await maybeRunChunkCleanup();
        const maxFileSizeBytes = await getConfiguredMaxFileSizeBytes(fastify);
        const body = (request.body ?? {}) as {
          filename?: string;
          mimetype?: string;
          size?: number;
          chunkSize?: number;
          totalChunks?: number;
        };

        const filename = String(body.filename ?? "").trim();
        const mimetype = String(body.mimetype ?? "").trim();
        const expectedSize = Number(body.size ?? 0);
        const requestedChunkSize = Number(body.chunkSize ?? DEFAULT_CHUNK_SIZE);
        const chunkSize = Math.min(MAX_CHUNK_SIZE, Math.max(MIN_CHUNK_SIZE, requestedChunkSize));
        const totalChunks = Number(body.totalChunks ?? 0);

        if (!filename || !mimetype || !Number.isFinite(expectedSize) || expectedSize <= 0) {
          return reply.code(400).send({ error: "Invalid chunk init payload" });
        }
        if (expectedSize > maxFileSizeBytes) {
          return reply.code(400).send({ error: `File exceeds ${Math.floor(maxFileSizeBytes / 1024 / 1024)} MB limit` });
        }
        if (!Number.isFinite(totalChunks) || totalChunks <= 0 || totalChunks > 5000) {
          return reply.code(400).send({ error: "Invalid totalChunks" });
        }

        await fs.mkdir(getChunkRoot(), { recursive: true });
        const uploadId = randomUUID();
        const session: ChunkSession = {
          id: uploadId,
          ownerUserId: request.authUser!.profileId,
          filename,
          mimetype,
          expectedSize,
          chunkSize,
          totalChunks,
          nextChunkIndex: 0,
          uploadedBytes: 0,
          createdAt: new Date().toISOString()
        };
        await saveChunkSession(session);
        await fs.writeFile(sessionFilePath(uploadId), Buffer.alloc(0));

        return reply.send({ uploadId, chunkSize, totalChunks });
      } catch (error) {
        return reply.code(400).send({ error: (error as Error).message });
      }
    }
  );

  fastify.put(
    "/chunks/:uploadId/:chunkIndex",
    { preHandler: [requireAuth, requireRole("uploader", "super_admin")] },
    async (request, reply) => {
      try {
        const params = request.params as { uploadId: string; chunkIndex: string };
        const chunkIndex = Number(params.chunkIndex);
        if (!Number.isInteger(chunkIndex) || chunkIndex < 0) {
          return reply.code(400).send({ error: "Invalid chunk index" });
        }

        const session = await loadChunkSession(params.uploadId);
        if (session.ownerUserId !== request.authUser!.profileId) {
          return reply.code(403).send({ error: "Forbidden" });
        }
        if (chunkIndex !== session.nextChunkIndex) {
          return reply.code(409).send({ error: `Expected chunk index ${session.nextChunkIndex}` });
        }

        const isLastChunk = chunkIndex === session.totalChunks - 1;
        const maxChunkBytes = isLastChunk ? session.chunkSize + 1024 : session.chunkSize;
        const chunkBuffer = await readRequestBodyToBuffer(request, maxChunkBytes);
        if (chunkBuffer.length === 0) {
          return reply.code(400).send({ error: "Empty chunk body" });
        }

        await fs.appendFile(sessionFilePath(session.id), chunkBuffer);
        session.nextChunkIndex += 1;
        session.uploadedBytes += chunkBuffer.length;
        if (session.uploadedBytes > session.expectedSize + 1024) {
          await removeChunkSession(session.id);
          return reply.code(400).send({ error: "Chunked upload exceeded expected size" });
        }
        await saveChunkSession(session);

        return reply.send({
          ok: true,
          nextChunkIndex: session.nextChunkIndex,
          uploadedBytes: session.uploadedBytes,
          completed: session.nextChunkIndex >= session.totalChunks
        });
      } catch (error) {
        return reply.code(400).send({ error: (error as Error).message });
      }
    }
  );

  fastify.delete(
    "/chunks/:uploadId",
    { preHandler: [requireAuth, requireRole("uploader", "super_admin")] },
    async (request, reply) => {
      try {
        const uploadId = (request.params as { uploadId: string }).uploadId;
        const session = await loadChunkSession(uploadId);
        if (session.ownerUserId !== request.authUser!.profileId) {
          return reply.code(403).send({ error: "Forbidden" });
        }
        await removeChunkSession(uploadId);
        return reply.send({ ok: true });
      } catch (error) {
        return reply.code(400).send({ error: (error as Error).message });
      }
    }
  );

  fastify.get(
    "/upload-config",
    { preHandler: [requireAuth, requireRole("uploader", "super_admin")] },
    async (_request, reply) => {
      const maxFileSizeBytes = await getConfiguredMaxFileSizeBytes(fastify);
      return reply.send({ maxFileSizeBytes });
    }
  );

  fastify.get("/me", { preHandler: [requireAuth, requireRole("uploader", "super_admin")] }, async (request, reply) => {
    const rows = await getMyFiles(fastify, request.authUser!.profileId);
    return reply.send({ items: rows });
  });

  fastify.post(
    "/",
    { preHandler: [requireAuth, requireRole("uploader", "super_admin")] },
    async (request, reply) => {
      try {
        const maxFileSizeBytes = await getConfiguredMaxFileSizeBytes(fastify);
        const parsed = await parseMultipartForm(request, maxFileSizeBytes);
        let mainFile = parsed.files.file;
        const coverFile = parsed.files.coverImage;
        const chunkUploadId = String(parsed.fields.chunkUploadId ?? "").trim();

        if (!coverFile) {
          return reply.code(400).send({ error: "coverImage is required" });
        }

        if (!mainFile && chunkUploadId) {
          const session = await loadChunkSession(chunkUploadId);
          if (session.ownerUserId !== request.authUser!.profileId) {
            return reply.code(403).send({ error: "Forbidden" });
          }
          if (session.nextChunkIndex < session.totalChunks) {
            return reply.code(400).send({ error: "Chunked upload is incomplete" });
          }

          const assembled = await fs.readFile(sessionFilePath(chunkUploadId));
          if (assembled.length === 0) {
            await removeChunkSession(chunkUploadId);
            return reply.code(400).send({ error: "Chunked upload produced an empty file" });
          }
          if (Math.abs(assembled.length - session.expectedSize) > 1024) {
            await removeChunkSession(chunkUploadId);
            return reply.code(400).send({ error: "Chunked upload size mismatch" });
          }

          mainFile = {
            filename: session.filename,
            mimetype: session.mimetype,
            buffer: Buffer.from(assembled)
          };
        }

        const created = await createFileUpload(fastify, {
          ownerUserId: request.authUser!.profileId,
          metadata: parsed.fields,
          mainFile,
          coverFile,
          maxMainFileBytes: maxFileSizeBytes
        });

        if (chunkUploadId) {
          await removeChunkSession(chunkUploadId);
        }
        return reply.code(201).send({ item: created });
      } catch (error) {
        try {
          await insertAuditLog(fastify, {
            actorUserId: request.authUser!.profileId,
            action: "file.upload_failed",
            targetType: "file",
            targetId: request.authUser!.profileId,
            metadata: { error: (error as Error).message }
          });
        } catch {
          // Keep user-facing error deterministic even if audit insert fails.
        }
        return reply.code(400).send({ error: (error as Error).message });
      }
    }
  );

  fastify.post(
    "/:fileId/publication-resubmit",
    { preHandler: [requireAuth, requireRole("uploader", "super_admin")] },
    async (request, reply) => {
      try {
        const fileId = (request.params as { fileId: string }).fileId;
        const file = await fetchFileById(fastify, fileId);
        if (!file) return reply.code(404).send({ error: "File not found" });
        if (file.owner_user_id !== request.authUser!.profileId && request.authUser!.role !== "super_admin") {
          return reply.code(403).send({ error: "Forbidden" });
        }
        if (file.status !== "rejected_review") {
          return reply.code(400).send({ error: "Only rejected files can be resubmitted" });
        }

        await resubmitForPublicationReview(fastify, fileId);
        await insertAuditLog(fastify, {
          actorUserId: request.authUser!.profileId,
          action: "publication.resubmitted",
          targetType: "file",
          targetId: fileId
        });
        return reply.send({ ok: true });
      } catch (error) {
        return reply.code(400).send({ error: (error as Error).message });
      }
    }
  );
};
