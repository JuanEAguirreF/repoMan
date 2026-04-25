import { FastifyInstance } from "fastify";

export type FileStatus = "active" | "pending_review" | "rejected_review" | "pending_deletion" | "deleted";

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
    .select("id,title,alternate_name,author,artist,slug,description,category,content_origin,mime_type,file_size_bytes,status,created_at,cover_image_path,has_backup")
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
  status: FileStatus,
  deletedAt: string | null
): Promise<void> {
  const patch: Record<string, unknown> = { status };
  if (deletedAt) patch.deleted_at = deletedAt;
  if (deletedAt === null) patch.deleted_at = null;
  const { error } = await fastify.supabaseAdmin.from("files").update(patch).eq("id", fileId);
  if (error) throw error;
}

export async function approveFilePublication(fastify: FastifyInstance, fileId: string): Promise<void> {
  const { error } = await fastify.supabaseAdmin
    .from("files")
    .update({
      status: "active",
      deleted_at: null,
      is_public: true,
      published_at: new Date().toISOString()
    })
    .eq("id", fileId);
  if (error) throw error;
}

export async function rejectFilePublication(fastify: FastifyInstance, fileId: string): Promise<void> {
  const { error } = await fastify.supabaseAdmin
    .from("files")
    .update({
      status: "rejected_review",
      is_public: false
    })
    .eq("id", fileId);
  if (error) throw error;
}

export async function updateFileMetadata(
  fastify: FastifyInstance,
  fileId: string,
  patch: {
    title?: string;
    description?: string;
    category?: string;
    content_origin?: "manga" | "manhwa" | "manhua";
    tags?: string[];
    extra_metadata?: Record<string, unknown>;
  }
) {
  const { data, error } = await fastify.supabaseAdmin.from("files").update(patch).eq("id", fileId).select("*").single();
  if (error) throw error;
  return data;
}

export async function listPendingPublicationFiles(fastify: FastifyInstance) {
  const { data, error } = await fastify.supabaseAdmin
    .from("files")
    .select("id,title,slug,category,status,owner_user_id,created_at,published_at")
    .eq("status", "pending_review")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function listPublicFiles(
  fastify: FastifyInstance,
  params?: { page?: number; pageSize?: number; query?: string }
) {
  const page = Math.max(1, Math.floor(params?.page ?? 1));
  const pageSize = Math.min(1000, Math.max(1, Math.floor(params?.pageSize ?? 24)));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  const q = (params?.query ?? "").trim();

  let queryBuilder = fastify.supabaseAdmin
    .from("files")
    .select(
      "id,title,alternate_name,author,artist,slug,description,category,content_origin,tags,mime_type,file_size_bytes,created_at,published_at,cover_image_path,status,is_public,has_backup",
      { count: "exact" }
    )
    .eq("status", "active")
    .eq("is_public", true)
    .order("published_at", { ascending: false });

  if (q.length > 0) {
    const escaped = q.replace(/[,()]/g, " ").replace(/\s+/g, " ").trim();
    queryBuilder = queryBuilder.or(
      `title.ilike.%${escaped}%,alternate_name.ilike.%${escaped}%,description.ilike.%${escaped}%,category.ilike.%${escaped}%`
    );
  }

  const { data, error, count } = await queryBuilder.range(from, to);
  if (error) throw error;

  return {
    items: data ?? [],
    total: count ?? 0,
    page,
    pageSize
  };
}

export async function listAllPublicFilesForSitemap(fastify: FastifyInstance) {
  const pageSize = 1000;
  let page = 1;
  let all: Record<string, unknown>[] = [];

  while (true) {
    const chunk = await listPublicFiles(fastify, { page, pageSize });
    all = all.concat(chunk.items);
    if (all.length >= chunk.total || chunk.items.length < pageSize) break;
    page += 1;
  }

  return all;
}

export async function getPublicFileById(fastify: FastifyInstance, fileId: string) {
  const selectClause =
    "id,title,alternate_name,author,artist,slug,description,category,content_origin,tags,mime_type,file_size_bytes,created_at,published_at,cover_image_path,status,is_public,has_backup";
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
