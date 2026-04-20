import { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { requireAuth, requireRole } from "../auth/auth.middleware.js";
import { requestFileDeletion } from "./deletion.service.js";

const requestDeletionBody = z.object({
  reason: z.string().max(1000).optional()
});

export const deletionRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post(
    "/files/:fileId/deletion-requests",
    { preHandler: [requireAuth, requireRole("uploader", "super_admin")] },
    async (request, reply) => {
      try {
        const fileId = (request.params as { fileId: string }).fileId;
        const parsed = requestDeletionBody.parse(request.body ?? {});
        const item = await requestFileDeletion(fastify, {
          fileId,
          requesterUserId: request.authUser!.profileId,
          reason: parsed.reason
        });
        return reply.code(201).send({ item });
      } catch (error) {
        return reply.code(400).send({ error: (error as Error).message });
      }
    }
  );
};
