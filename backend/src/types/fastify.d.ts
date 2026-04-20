import "fastify";

export type AppRole = "super_admin" | "uploader";

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
