import { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { requireAuth, requireRole } from "../auth/auth.middleware.js";
import { requestFileEdit } from "./edit.service.js";

const requestEditBody = z.object({
  reason: z.string().max(1000).optional(),
  proposedPatch: z.record(z.unknown())
});

export const editRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post(
    "/files/:fileId/edit-requests",
    { preHandler: [requireAuth, requireRole("uploader", "super_admin")] },
    async (request, reply) => {
      try {
        const fileId = (request.params as { fileId: string }).fileId;
        const parsed = requestEditBody.parse(request.body ?? {});
        const item = await requestFileEdit(fastify, {
          fileId,
          requesterUserId: request.authUser!.profileId,
          requesterRole: request.authUser!.role,
          reason: parsed.reason,
          proposedPatch: parsed.proposedPatch
        });
        return reply.code(201).send({ item });
      } catch (error) {
        return reply.code(400).send({ error: (error as Error).message });
      }
    }
  );
};
