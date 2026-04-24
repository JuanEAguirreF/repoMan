import { FastifyInstance } from "fastify";
import { env } from "../../config/env.js";

const MAX_FILE_SIZE_KEY = "max_file_size_bytes";
const MIN_BYTES = 5 * 1024 * 1024;
const MAX_BYTES = 1024 * 1024 * 1024;

function clampBytes(value: number): number {
  if (!Number.isFinite(value)) return env.MAX_FILE_SIZE_BYTES;
  return Math.min(MAX_BYTES, Math.max(MIN_BYTES, Math.floor(value)));
}

export async function getConfiguredMaxFileSizeBytes(fastify: FastifyInstance): Promise<number> {
  const { data, error } = await fastify.supabaseAdmin
    .from("system_settings")
    .select("value_text")
    .eq("key", MAX_FILE_SIZE_KEY)
    .maybeSingle();

  if (error) return env.MAX_FILE_SIZE_BYTES;

  const parsed = Number(data?.value_text ?? env.MAX_FILE_SIZE_BYTES);
  return clampBytes(parsed);
}

export async function setConfiguredMaxFileSizeBytes(fastify: FastifyInstance, bytes: number): Promise<number> {
  const safeBytes = clampBytes(bytes);

  const { error } = await fastify.supabaseAdmin
    .from("system_settings")
    .upsert(
      {
        key: MAX_FILE_SIZE_KEY,
        value_text: String(safeBytes),
        updated_at: new Date().toISOString()
      },
      { onConflict: "key" }
    );

  if (error) throw error;
  return safeBytes;
}

