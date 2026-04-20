import { FastifyPluginAsync } from "fastify";
import { requireAuth } from "./auth.middleware.js";

export const authRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/session", { preHandler: [requireAuth] }, async (request) => {
    return {
      user: request.authUser
    };
  });
};
