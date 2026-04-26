import { FastifyPluginAsync } from "fastify";
import fs from "node:fs/promises";
import { findAvatar } from "./avatar.storage.js";

export const usersPublicRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/avatars/:profileId", async (request, reply) => {
    try {
      const profileId = (request.params as { profileId: string }).profileId;
      const avatar = await findAvatar(profileId);
      if (!avatar) return reply.code(404).send({ error: "Avatar not found" });

      reply.header("Cache-Control", "public, max-age=3600");
      reply.type(avatar.mimeType);
      return reply.send(await fs.readFile(avatar.absolutePath));
    } catch (error) {
      return reply.code(404).send({ error: (error as Error).message });
    }
  });
};

