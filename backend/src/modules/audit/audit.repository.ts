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

export async function listRecentAuditLogs(fastify: FastifyInstance, limit = 100) {
  const safeLimit = Math.min(500, Math.max(1, Math.floor(limit)));
  const { data, error } = await fastify.supabaseAdmin
    .from("audit_logs")
    .select("id,actor_user_id,action,target_type,target_id,metadata,created_at")
    .order("created_at", { ascending: false })
    .limit(safeLimit);
  if (error) throw error;
  return data ?? [];
}
