import { FastifyInstance } from "fastify";

export async function createDeletionRequest(
  fastify: FastifyInstance,
  params: { fileId: string; requestedByUserId: string; reason?: string }
) {
  const { data, error } = await fastify.supabaseAdmin
    .from("deletion_requests")
    .insert({
      file_id: params.fileId,
      requested_by_user_id: params.requestedByUserId,
      reason: params.reason ?? null,
      status: "pending"
    })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function getOpenDeletionRequestForFile(fastify: FastifyInstance, fileId: string) {
  const { data, error } = await fastify.supabaseAdmin
    .from("deletion_requests")
    .select("*")
    .eq("file_id", fileId)
    .eq("status", "pending")
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function listDeletionRequests(fastify: FastifyInstance, status = "pending") {
  const { data, error } = await fastify.supabaseAdmin
    .from("deletion_requests")
    .select("id,file_id,requested_by_user_id,reason,status,reviewed_by_user_id,requested_at,reviewed_at")
    .eq("status", status)
    .order("requested_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function getDeletionRequestById(fastify: FastifyInstance, requestId: string) {
  const { data, error } = await fastify.supabaseAdmin.from("deletion_requests").select("*").eq("id", requestId).maybeSingle();
  if (error) throw error;
  return data;
}

export async function reviewDeletionRequest(
  fastify: FastifyInstance,
  params: { requestId: string; reviewerUserId: string; status: "approved" | "rejected" }
) {
  const { data, error } = await fastify.supabaseAdmin
    .from("deletion_requests")
    .update({
      status: params.status,
      reviewed_by_user_id: params.reviewerUserId,
      reviewed_at: new Date().toISOString()
    })
    .eq("id", params.requestId)
    .eq("status", "pending")
    .select("*")
    .maybeSingle();
  if (error) throw error;
  return data;
}
