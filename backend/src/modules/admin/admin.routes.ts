import { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import fs from "node:fs/promises";
import fssync from "node:fs";
import crypto from "node:crypto";
import { requireAuth, requireRole } from "../auth/auth.middleware.js";
import { approveDeletionRequest, getPendingDeletionRequests, rejectDeletionRequest } from "../deletion/deletion.service.js";
import { getConfiguredMaxFileSizeBytes, setConfiguredMaxFileSizeBytes } from "./system-settings.repository.js";
import { approvePublication, fetchFileById, listPendingPublicationQueue, rejectPublication } from "../files/files.service.js";
import { insertAuditLog, listRecentAuditLogs } from "../audit/audit.repository.js";
import { approveEditRequest, getPendingEditRequests, rejectEditRequest } from "../edit/edit.service.js";
import { env } from "../../config/env.js";
import { safeJoin, sanitizeFilename } from "../../utils/filename.js";
import { inspectFileAsTree } from "../files/review-inspector.js";

const DOWNLOAD_TOKEN_TTL_SECONDS = 120;

function readClientIp(request: { ip: string; headers: Record<string, unknown> }) {
  const forwarded = String(request.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return forwarded || request.ip || "unknown";
}

export const adminRoutes: FastifyPluginAsync = async (fastify) => {
  const reviewRoles = ["super_admin"] as const;
  const requireReviewAccess = requireRole(...reviewRoles);

  async function getReviewablePendingFile(fileId: string) {
    const file = await fetchFileById(fastify, fileId);
    if (!file) throw new Error("File not found");
    if (file.status !== "pending_review") throw new Error("Only pending review files can be handled in this endpoint.");
    if (!file.has_backup || !file.file_path || file.file_path === "__no_backup__") {
      throw new Error("This publication request does not include a backup file.");
    }
    const absoluteFilePath = safeJoin(env.STORAGE_ROOT, String(file.file_path));
    return { file, absoluteFilePath };
  }

  fastify.get("/settings/upload-limits", { preHandler: [requireAuth, requireRole("super_admin")] }, async (_request, reply) => {
    const maxFileSizeBytes = await getConfiguredMaxFileSizeBytes(fastify);
    return reply.send({
      maxFileSizeBytes,
      maxFileSizeMb: Math.floor(maxFileSizeBytes / 1024 / 1024)
    });
  });

  fastify.post("/settings/upload-limits", { preHandler: [requireAuth, requireRole("super_admin")] }, async (request, reply) => {
    const schema = z.object({
      maxFileSizeMb: z.number().int().min(5).max(1024)
    });
    const parsed = schema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ error: "Invalid maxFileSizeMb. Expected integer between 5 and 1024." });
    }
    const bytes = parsed.data.maxFileSizeMb * 1024 * 1024;
    const savedBytes = await setConfiguredMaxFileSizeBytes(fastify, bytes);
    await insertAuditLog(fastify, {
      actorUserId: request.authUser!.profileId,
      action: "system.upload_limit_updated",
      targetType: "system_setting",
      targetId: request.authUser!.profileId,
      metadata: { maxFileSizeBytes: savedBytes }
    });
    return reply.send({
      maxFileSizeBytes: savedBytes,
      maxFileSizeMb: Math.floor(savedBytes / 1024 / 1024)
    });
  });

  fastify.get(
    "/deletion-requests",
    { preHandler: [requireAuth, requireRole("super_admin")] },
    async (_request, reply) => {
      const items = await getPendingDeletionRequests(fastify);
      return reply.send({ items });
    }
  );

  fastify.get("/publication-requests", { preHandler: [requireAuth, requireReviewAccess] }, async (_request, reply) => {
    const items = await listPendingPublicationQueue(fastify);
    return reply.send({ items });
  });

  fastify.get(
    "/publication-requests/:fileId/content-tree",
    { preHandler: [requireAuth, requireReviewAccess] },
    async (request, reply) => {
      try {
        const fileId = (request.params as { fileId: string }).fileId;
        const { file, absoluteFilePath } = await getReviewablePendingFile(fileId);
        try {
          await fs.access(absoluteFilePath);
        } catch {
          return reply.code(404).send({ error: "Stored file not found on server." });
        }

        const inspected = await inspectFileAsTree(absoluteFilePath, String(file.original_filename ?? ""));
        await insertAuditLog(fastify, {
          actorUserId: request.authUser!.profileId,
          action: "publication.content_tree_inspected",
          targetType: "file",
          targetId: fileId,
          metadata: { format: inspected.format, entries: inspected.summary.totalEntries }
        });

        reply.header("Cache-Control", "no-store");
        reply.header("Pragma", "no-cache");
        return reply.send({
          file: {
            id: file.id,
            title: file.title,
            originalFilename: file.original_filename,
            mimeType: file.mime_type,
            sizeBytes: file.file_size_bytes
          },
          inspection: inspected
        });
      } catch (error) {
        return reply.code(400).send({ error: (error as Error).message });
      }
    }
  );

  fastify.post(
    "/publication-requests/:fileId/download-token",
    { preHandler: [requireAuth, requireReviewAccess] },
    async (request, reply) => {
      try {
        const fileId = (request.params as { fileId: string }).fileId;
        const { absoluteFilePath } = await getReviewablePendingFile(fileId);
        try {
          await fs.access(absoluteFilePath);
        } catch {
          return reply.code(404).send({ error: "Stored file not found on server." });
        }

        const token = crypto.randomBytes(32).toString("base64url");
        const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
        const expiresAt = new Date(Date.now() + DOWNLOAD_TOKEN_TTL_SECONDS * 1000).toISOString();

        const { data, error } = await fastify.supabaseAdmin
          .from("admin_review_download_tokens")
          .insert({
            file_id: fileId,
            issued_to_user_id: request.authUser!.profileId,
            token_hash: tokenHash,
            expires_at: expiresAt
          })
          .select("id")
          .single();
        if (error) throw error;

        await insertAuditLog(fastify, {
          actorUserId: request.authUser!.profileId,
          action: "publication.download_token_issued",
          targetType: "file",
          targetId: fileId,
          metadata: { tokenId: data?.id ?? null, expiresAt }
        });

        reply.header("Cache-Control", "no-store");
        reply.header("Pragma", "no-cache");
        return reply.send({
          token,
          expiresAt,
          ttlSeconds: DOWNLOAD_TOKEN_TTL_SECONDS
        });
      } catch (error) {
        const msg = (error as Error).message;
        if (msg === "File not found") return reply.code(404).send({ error: msg });
        return reply.code(400).send({ error: msg });
      }
    }
  );

  fastify.get(
    "/publication-requests/:fileId/download",
    { preHandler: [requireAuth, requireReviewAccess] },
    async (request, reply) => {
      try {
        const fileId = (request.params as { fileId: string }).fileId;
        const query = z.object({ token: z.string().min(32).max(300) }).safeParse(request.query ?? {});
        if (!query.success) {
          return reply.code(401).send({ error: "Missing or invalid download token." });
        }
        const tokenHash = crypto.createHash("sha256").update(query.data.token).digest("hex");

        const { data: tokenRow, error: tokenError } = await fastify.supabaseAdmin
          .from("admin_review_download_tokens")
          .select("id,file_id,issued_to_user_id,expires_at,used_at")
          .eq("token_hash", tokenHash)
          .maybeSingle();
        if (tokenError) throw tokenError;
        if (!tokenRow) return reply.code(401).send({ error: "Invalid download token." });
        if (tokenRow.file_id !== fileId || tokenRow.issued_to_user_id !== request.authUser!.profileId) {
          return reply.code(403).send({ error: "Download token is not valid for this file or user." });
        }
        if (tokenRow.used_at) {
          return reply.code(401).send({ error: "Download token already used." });
        }
        if (new Date(tokenRow.expires_at).getTime() <= Date.now()) {
          return reply.code(401).send({ error: "Download token expired." });
        }

        const requesterIp = readClientIp(request as unknown as { ip: string; headers: Record<string, unknown> });
        const nowIso = new Date().toISOString();
        const { data: consumedToken, error: consumeErr } = await fastify.supabaseAdmin
          .from("admin_review_download_tokens")
          .update({ used_at: nowIso, used_by_ip: requesterIp })
          .eq("id", tokenRow.id)
          .is("used_at", null)
          .gt("expires_at", nowIso)
          .select("id")
          .maybeSingle();
        if (consumeErr) throw consumeErr;
        if (!consumedToken) {
          return reply.code(401).send({ error: "Download token already consumed or expired." });
        }

        const { file, absoluteFilePath } = await getReviewablePendingFile(fileId);
        let stat;
        try {
          stat = await fs.stat(absoluteFilePath);
        } catch {
          return reply.code(404).send({ error: "Stored file not found on server." });
        }

        const filename = sanitizeFilename(String(file.original_filename || "review-file.bin"));
        reply.header("Cache-Control", "no-store");
        reply.header("Pragma", "no-cache");
        reply.header("X-Content-Type-Options", "nosniff");
        reply.header("Content-Type", String(file.mime_type || "application/octet-stream"));
        reply.header("Content-Length", String(stat.size));
        reply.header("Content-Disposition", `attachment; filename="${filename}"`);

        await insertAuditLog(fastify, {
          actorUserId: request.authUser!.profileId,
          action: "publication.file_downloaded_for_review",
          targetType: "file",
          targetId: fileId,
          metadata: { originalFilename: filename, bytes: stat.size, tokenId: tokenRow.id }
        });

        return reply.send(fssync.createReadStream(absoluteFilePath));
      } catch (error) {
        return reply.code(400).send({ error: (error as Error).message });
      }
    }
  );

  fastify.post(
    "/publication-requests/:fileId/approve",
    { preHandler: [requireAuth, requireRole("super_admin")] },
    async (request, reply) => {
      try {
        const fileId = (request.params as { fileId: string }).fileId;
        await approvePublication(fastify, fileId);
        await insertAuditLog(fastify, {
          actorUserId: request.authUser!.profileId,
          action: "publication.approved",
          targetType: "file",
          targetId: fileId
        });
        return reply.send({ ok: true });
      } catch (error) {
        return reply.code(400).send({ error: (error as Error).message });
      }
    }
  );

  fastify.post(
    "/publication-requests/:fileId/reject",
    { preHandler: [requireAuth, requireRole("super_admin")] },
    async (request, reply) => {
      try {
        const fileId = (request.params as { fileId: string }).fileId;
        await rejectPublication(fastify, fileId);
        await insertAuditLog(fastify, {
          actorUserId: request.authUser!.profileId,
          action: "publication.rejected",
          targetType: "file",
          targetId: fileId
        });
        return reply.send({ ok: true });
      } catch (error) {
        return reply.code(400).send({ error: (error as Error).message });
      }
    }
  );

  fastify.get("/edit-requests", { preHandler: [requireAuth, requireRole("super_admin")] }, async (_request, reply) => {
    const items = await getPendingEditRequests(fastify);
    return reply.send({ items });
  });

  fastify.post(
    "/edit-requests/:requestId/approve",
    { preHandler: [requireAuth, requireRole("super_admin")] },
    async (request, reply) => {
      try {
        const requestId = (request.params as { requestId: string }).requestId;
        const item = await approveEditRequest(fastify, {
          requestId,
          reviewerUserId: request.authUser!.profileId
        });
        return reply.send({ item });
      } catch (error) {
        return reply.code(400).send({ error: (error as Error).message });
      }
    }
  );

  fastify.post(
    "/edit-requests/:requestId/reject",
    { preHandler: [requireAuth, requireRole("super_admin")] },
    async (request, reply) => {
      try {
        const requestId = (request.params as { requestId: string }).requestId;
        const item = await rejectEditRequest(fastify, {
          requestId,
          reviewerUserId: request.authUser!.profileId
        });
        return reply.send({ item });
      } catch (error) {
        return reply.code(400).send({ error: (error as Error).message });
      }
    }
  );

  fastify.get("/files", { preHandler: [requireAuth, requireRole("super_admin")] }, async (_request, reply) => {
    const { data, error } = await fastify.supabaseAdmin
      .from("files")
      .select(
        "id,title,category,status,owner_user_id,created_at,published_at,owner_profile:users_profiles!files_owner_user_id_fkey(auth_user_id,display_name)"
      )
      .order("created_at", { ascending: false });
    if (error) return reply.code(400).send({ error: error.message });

    const rows = (data ?? []) as Array<{
      id: string;
      title: string;
      category: string;
      status: "active" | "pending_review" | "rejected_review" | "pending_deletion" | "deleted";
      owner_user_id: string;
      owner_profile?: { auth_user_id?: string; display_name?: string } | null;
    }>;

    const authUserIds = Array.from(
      new Set(
        rows
          .map((row) => row.owner_profile?.auth_user_id)
          .filter((id): id is string => typeof id === "string" && id.length > 0)
      )
    );

    const emailMap = new Map<string, string>();
    await Promise.all(
      authUserIds.map(async (authUserId) => {
        const { data: authUser, error: authErr } = await fastify.supabaseAdmin.auth.admin.getUserById(authUserId);
        if (!authErr && authUser?.user?.email) {
          emailMap.set(authUserId, authUser.user.email);
        }
      })
    );

    const items = rows.map((row) => {
      const authUserId = row.owner_profile?.auth_user_id ?? "";
      const ownerEmail = authUserId ? emailMap.get(authUserId) ?? null : null;
      const ownerLabel = ownerEmail || row.owner_profile?.display_name || row.owner_user_id;

      return {
        id: row.id,
        title: row.title,
        category: row.category,
        status: row.status,
        owner_user_id: row.owner_user_id,
        owner_email: ownerEmail,
        owner_display_name: row.owner_profile?.display_name ?? null,
        owner_label: ownerLabel
      };
    });

    return reply.send({ items });
  });

  fastify.post(
    "/files/:fileId/publication-resubmit",
    { preHandler: [requireAuth, requireRole("super_admin")] },
    async (request, reply) => {
      try {
        const fileId = (request.params as { fileId: string }).fileId;
        const file = await fetchFileById(fastify, fileId);
        if (!file) return reply.code(404).send({ error: "File not found" });
        if (file.status !== "rejected_review") {
          return reply.code(400).send({ error: "Only rejected files can be resubmitted from admin" });
        }
        await fastify.supabaseAdmin.from("files").update({ status: "pending_review", is_public: false }).eq("id", fileId);
        await insertAuditLog(fastify, {
          actorUserId: request.authUser!.profileId,
          action: "publication.resubmitted_by_admin",
          targetType: "file",
          targetId: fileId
        });
        return reply.send({ ok: true });
      } catch (error) {
        return reply.code(400).send({ error: (error as Error).message });
      }
    }
  );

  fastify.get("/audit-logs", { preHandler: [requireAuth, requireRole("super_admin")] }, async (request, reply) => {
    try {
      const query = z.object({ limit: z.coerce.number().int().min(1).max(500).optional() }).parse(request.query ?? {});
      const rows = await listRecentAuditLogs(fastify, query.limit ?? 100);
      return reply.send({ items: rows });
    } catch (error) {
      return reply.code(400).send({ error: (error as Error).message });
    }
  });

  fastify.post(
    "/deletion-requests/:requestId/approve",
    { preHandler: [requireAuth, requireRole("super_admin")] },
    async (request, reply) => {
      try {
        const requestId = (request.params as { requestId: string }).requestId;
        const item = await approveDeletionRequest(fastify, {
          requestId,
          reviewerUserId: request.authUser!.profileId
        });
        return reply.send({ item });
      } catch (error) {
        return reply.code(400).send({ error: (error as Error).message });
      }
    }
  );

  fastify.post(
    "/deletion-requests/:requestId/reject",
    { preHandler: [requireAuth, requireRole("super_admin")] },
    async (request, reply) => {
      try {
        const requestId = (request.params as { requestId: string }).requestId;
        const item = await rejectDeletionRequest(fastify, {
          requestId,
          reviewerUserId: request.authUser!.profileId
        });
        return reply.send({ item });
      } catch (error) {
        return reply.code(400).send({ error: (error as Error).message });
      }
    }
  );
};
