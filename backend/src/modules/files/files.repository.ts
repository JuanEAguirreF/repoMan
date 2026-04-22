import { FastifyInstance } from "fastify";

export async function createFileRecord(
  fastify: FastifyInstance,
  data: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const { data: created, error } = await fastify.supabaseAdmin.from("files").insert(data).select("*").single();
  if (error) throw error;
  return created as Record<string, unknown>;
}

export async function listFilesByOwner(fastify: FastifyInstance, ownerUserId: string) {
  const { data, error } = await fastify.supabaseAdmin
    .from("files")
    .select("id,title,slug,category,content_origin,mime_type,file_size_bytes,status,created_at,cover_image_path,has_backup")
    .eq("owner_user_id", ownerUserId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function getFileById(fastify: FastifyInstance, fileId: string) {
  const { data, error } = await fastify.supabaseAdmin.from("files").select("*").eq("id", fileId).maybeSingle();
  if (error) throw error;
  return data;
}

export async function setFileStatus(
  fastify: FastifyInstance,
  fileId: string,
  status: "active" | "pending_deletion" | "deleted",
  deletedAt: string | null
): Promise<void> {
  const patch: Record<string, unknown> = { status };
  if (deletedAt) patch.deleted_at = deletedAt;
  if (deletedAt === null) patch.deleted_at = null;
  const { error } = await fastify.supabaseAdmin.from("files").update(patch).eq("id", fileId);
  if (error) throw error;
}

export async function listPublicFiles(fastify: FastifyInstance) {
  const { data, error } = await fastify.supabaseAdmin
    .from("files")
    .select("id,title,slug,description,category,content_origin,tags,mime_type,file_size_bytes,created_at,published_at,cover_image_path,status,is_public,has_backup")
    .eq("status", "active")
    .eq("is_public", true)
    .order("published_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function getPublicFileById(fastify: FastifyInstance, fileId: string) {
  const selectClause =
    "id,title,slug,description,category,content_origin,tags,mime_type,file_size_bytes,created_at,published_at,cover_image_path,status,is_public,has_backup";
  const query = fastify.supabaseAdmin
    .from("files")
    .select(selectClause)
    .eq("status", "active")
    .eq("is_public", true);
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(fileId);
  const { data, error } = await (isUuid ? query.eq("id", fileId) : query.eq("slug", fileId)).maybeSingle();
  if (error) throw error;
  return data;
}
