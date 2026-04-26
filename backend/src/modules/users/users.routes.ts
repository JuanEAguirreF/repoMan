import { FastifyPluginAsync } from "fastify";
import { MultipartFile } from "@fastify/multipart";
import { requireAuth, requireRole } from "../auth/auth.middleware.js";
import { getMyFiles } from "../files/files.service.js";
import { buildAvatarPublicUrl, findAvatar, saveAvatar } from "./avatar.storage.js";

const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
const AVATAR_ALLOWED_MIME = new Set(["image/png", "image/jpeg", "image/webp"]);
const AVATAR_EXT_BY_MIME: Record<string, ".png" | ".jpg" | ".webp"> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp"
};

async function readMultipartFileToBuffer(filePart: MultipartFile, maxBytes: number): Promise<Buffer<ArrayBufferLike>> {
  const chunks: Buffer<ArrayBufferLike>[] = [];
  let size = 0;
  for await (const chunk of filePart.file) {
    const bufferChunk = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += bufferChunk.length;
    if (size > maxBytes) {
      throw new Error(`File exceeded ${Math.floor(maxBytes / 1024 / 1024)} MB limit`);
    }
    chunks.push(bufferChunk);
  }
  return Buffer.concat(chunks);
}

export const usersRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/me", { preHandler: [requireAuth, requireRole("uploader", "super_admin")] }, async (request, reply) => {
    try {
      const profileId = request.authUser!.profileId;
      const files = await getMyFiles(fastify, profileId);
      type OwnedFileRow = { status: string };
      const typedFiles = files as OwnedFileRow[];
      const avatar = await findAvatar(profileId);

      const { data: latestLoginRows } = await fastify.supabaseAdmin
        .from("audit_logs")
        .select("created_at,metadata")
        .eq("actor_user_id", profileId)
        .eq("action", "auth.login_success")
        .order("created_at", { ascending: false })
        .limit(1);

      const lastLoginAt = latestLoginRows?.[0]?.created_at ?? null;
      let email = "";
      try {
        const authUser = await fastify.supabaseAdmin.auth.admin.getUserById(request.authUser!.authUserId);
        email = authUser.data.user?.email ?? "";
      } catch {
        email = "";
      }

      const stats = {
        total: typedFiles.length,
        active: typedFiles.filter((row) => row.status === "active").length,
        pendingDeletion: typedFiles.filter((row) => row.status === "pending_deletion").length,
        deleted: typedFiles.filter((row) => row.status === "deleted").length,
        pendingReview: typedFiles.filter((row) => row.status === "pending_review").length
      };

      return reply.send({
        profile: {
          id: profileId,
          authUserId: request.authUser!.authUserId,
          role: request.authUser!.role,
          displayName: request.authUser!.displayName,
          email,
          avatarUrl: avatar ? buildAvatarPublicUrl(profileId, avatar.mtimeMs) : null,
          lastLoginAt
        },
        stats,
        files
      });
    } catch (error) {
      return reply.code(400).send({ error: (error as Error).message });
    }
  });

  fastify.post("/me/avatar", { preHandler: [requireAuth, requireRole("uploader", "super_admin")] }, async (request, reply) => {
    try {
      const filePart = await request.file({
        limits: {
          files: 1,
          fileSize: MAX_AVATAR_BYTES
        }
      });
      if (!filePart) return reply.code(400).send({ error: "Avatar file is required" });

      const mime = String(filePart.mimetype || "").toLowerCase().split(";")[0].trim();
      if (!AVATAR_ALLOWED_MIME.has(mime)) {
        return reply.code(400).send({ error: "Unsupported avatar image type" });
      }
      const ext = AVATAR_EXT_BY_MIME[mime];
      const buffer = await readMultipartFileToBuffer(filePart, MAX_AVATAR_BYTES);
      if (buffer.length === 0) {
        return reply.code(400).send({ error: "Avatar file is empty" });
      }

      const profileId = request.authUser!.profileId;
      await saveAvatar({
        profileId,
        ext,
        buffer
      });
      const avatar = await findAvatar(profileId);

      return reply.send({
        ok: true,
        avatarUrl: avatar ? buildAvatarPublicUrl(profileId, avatar.mtimeMs) : null
      });
    } catch (error) {
      return reply.code(400).send({ error: (error as Error).message });
    }
  });
};
