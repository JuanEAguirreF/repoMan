import { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { requireAuth, requireRole } from "../auth/auth.middleware.js";
import { approveDeletionRequest, getPendingDeletionRequests, rejectDeletionRequest } from "../deletion/deletion.service.js";
import { getConfiguredMaxFileSizeBytes, setConfiguredMaxFileSizeBytes } from "./system-settings.repository.js";
import { approvePublication, fetchFileById, listPendingPublicationQueue, rejectPublication } from "../files/files.service.js";
import { insertAuditLog, listRecentAuditLogs } from "../audit/audit.repository.js";
import { approveEditRequest, getPendingEditRequests, rejectEditRequest } from "../edit/edit.service.js";

export const adminRoutes: FastifyPluginAsync = async (fastify) => {
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

  fastify.get("/publication-requests", { preHandler: [requireAuth, requireRole("super_admin")] }, async (_request, reply) => {
    const items = await listPendingPublicationQueue(fastify);
    return reply.send({ items });
  });

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
