import { FastifyPluginAsync } from "fastify";
import { requireAuth } from "./auth.middleware.js";
import { insertAuditLog } from "../audit/audit.repository.js";

const LOGIN_AUDIT_THROTTLE_MS = 15 * 60 * 1000;
const lastLoginAuditByUser = new Map<string, number>();

export const authRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/session", { preHandler: [requireAuth] }, async (request) => {
    const profileId = request.authUser!.profileId;
    const now = Date.now();
    const lastLoggedAt = lastLoginAuditByUser.get(profileId) ?? 0;
    if (now - lastLoggedAt > LOGIN_AUDIT_THROTTLE_MS) {
      lastLoginAuditByUser.set(profileId, now);
      void insertAuditLog(fastify, {
        actorUserId: profileId,
        action: "auth.login_success",
        targetType: "user",
        targetId: profileId,
        metadata: {
          ip:
            String(request.headers["x-forwarded-for"] || "")
              .split(",")[0]
              .trim() || request.ip
        }
      }).catch(() => {});
    }

    return {
      user: request.authUser
    };
  });
};
