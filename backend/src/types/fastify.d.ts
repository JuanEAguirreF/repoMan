import "fastify";
import type { AppRole } from "./app-role.js";

declare module "fastify" {
  interface FastifyRequest {
    authUser?: {
      profileId: string;
      authUserId: string;
      role: AppRole;
      displayName: string;
    };
  }
}
