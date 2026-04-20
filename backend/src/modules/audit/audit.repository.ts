import { FastifyInstance } from "fastify";

export async function insertAuditLog(
  fastify: FastifyInstance,
  params: {
    actorUserId: string;
    action: string;
    targetType: string;
    targetId: string;
    metadata?: Record<string, unknown>;
  }
): Promise<void> {
  await fastify.supabaseAdmin.from("audit_logs").insert({
    actor_user_id: params.actorUserId,
    action: params.action,
    target_type: params.targetType,
    target_id: params.targetId,
    metadata: params.metadata ?? {}
  });
}
