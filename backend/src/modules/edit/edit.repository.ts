import { FastifyInstance } from "fastify";

export type EditRequestStatus = "pending" | "approved" | "rejected";

export async function getOpenEditRequestForFile(fastify: FastifyInstance, fileId: string) {
  const { data, error } = await fastify.supabaseAdmin
    .from("file_edit_requests")
    .select("*")
    .eq("file_id", fileId)
    .eq("status", "pending")
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function createEditRequest(
  fastify: FastifyInstance,
  params: { fileId: string; requestedByUserId: string; reason?: string; proposedPatch: Record<string, unknown> }
) {
  const { data, error } = await fastify.supabaseAdmin
    .from("file_edit_requests")
    .insert({
      file_id: params.fileId,
      requested_by_user_id: params.requestedByUserId,
      reason: params.reason ?? null,
      proposed_patch: params.proposedPatch,
      status: "pending"
    })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function listEditRequests(fastify: FastifyInstance, status: EditRequestStatus = "pending") {
  const { data, error } = await fastify.supabaseAdmin
    .from("file_edit_requests")
    .select("id,file_id,requested_by_user_id,reason,proposed_patch,status,reviewed_by_user_id,requested_at,reviewed_at")
    .eq("status", status)
    .order("requested_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function getEditRequestById(fastify: FastifyInstance, requestId: string) {
  const { data, error } = await fastify.supabaseAdmin.from("file_edit_requests").select("*").eq("id", requestId).maybeSingle();
  if (error) throw error;
  return data;
}

export async function reviewEditRequest(
  fastify: FastifyInstance,
  params: { requestId: string; reviewerUserId: string; status: "approved" | "rejected" }
) {
  const { data, error } = await fastify.supabaseAdmin
    .from("file_edit_requests")
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
