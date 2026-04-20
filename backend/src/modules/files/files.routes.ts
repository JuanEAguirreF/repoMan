import { FastifyPluginAsync } from "fastify";
import { MultipartFile, MultipartValue } from "@fastify/multipart";
import { env } from "../../config/env.js";
import { requireAuth, requireRole } from "../auth/auth.middleware.js";
import { createFileUpload, getMyFiles, UploadedFileInput } from "./files.service.js";

type ParsedForm = {
  fields: Record<string, string>;
  files: Record<string, UploadedFileInput>;
};

async function parseMultipartForm(request: any): Promise<ParsedForm> {
  const fields: Record<string, string> = {};
  const files: Record<string, UploadedFileInput> = {};

  const parts = request.parts({
    limits: {
      fileSize: env.MAX_FILE_SIZE_BYTES,
      files: 2
    }
  });

  for await (const part of parts) {
    if (part.type === "file") {
      const filePart = part as MultipartFile;
      const buffer = await filePart.toBuffer();
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
  fastify.get("/me", { preHandler: [requireAuth, requireRole("uploader", "super_admin")] }, async (request, reply) => {
    const rows = await getMyFiles(fastify, request.authUser!.profileId);
    return reply.send({ items: rows });
  });

  fastify.post("/", { preHandler: [requireAuth, requireRole("uploader", "super_admin")] }, async (request, reply) => {
    try {
      const parsed = await parseMultipartForm(request);
      const mainFile = parsed.files.file;
      const coverFile = parsed.files.coverImage;

      if (!mainFile || !coverFile) {
        return reply.code(400).send({ error: "file and coverImage are required" });
      }

      const created = await createFileUpload(fastify, {
        ownerUserId: request.authUser!.profileId,
        metadata: parsed.fields,
        mainFile,
        coverFile
      });
      return reply.code(201).send({ item: created });
    } catch (error) {
      return reply.code(400).send({ error: (error as Error).message });
    }
  });
};
