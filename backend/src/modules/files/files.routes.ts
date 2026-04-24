import { FastifyPluginAsync } from "fastify";
import { MultipartFile, MultipartValue } from "@fastify/multipart";
import { env } from "../../config/env.js";
import { requireAuth, requireRole } from "../auth/auth.middleware.js";
import { createFileUpload, fetchFileById, getMyFiles, resubmitForPublicationReview, UploadedFileInput } from "./files.service.js";
import { getConfiguredMaxFileSizeBytes } from "../admin/system-settings.repository.js";
import { insertAuditLog } from "../audit/audit.repository.js";

type ParsedForm = {
  fields: Record<string, string>;
  files: Record<string, UploadedFileInput>;
};

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
        const mainFile = parsed.files.file;
        const coverFile = parsed.files.coverImage;

        if (!coverFile) {
          return reply.code(400).send({ error: "coverImage is required" });
        }

        const created = await createFileUpload(fastify, {
          ownerUserId: request.authUser!.profileId,
          metadata: parsed.fields,
          mainFile,
          coverFile,
          maxMainFileBytes: maxFileSizeBytes
        });
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
