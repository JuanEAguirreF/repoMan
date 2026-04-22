import { FastifyPluginAsync } from "fastify";
import fs from "node:fs/promises";
import path from "node:path";
import { env } from "../../config/env.js";
import { safeJoin } from "../../utils/filename.js";
import { getPublicCatalog, getPublicCatalogDetail } from "../files/files.service.js";
import { getCached, setCached } from "./public.cache.js";

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function getPublicSiteUrl(): string {
  const origins = env.FRONTEND_ORIGIN.split(",").map((o) => o.trim().replace(/\/$/, ""));
  const httpsOrigin = origins.find((origin) => origin.startsWith("https://"));
  return httpsOrigin || origins[0] || "https://repoman.comunidaddelmanga.com";
}

export const publicRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/sitemap.xml", async (_request, reply) => {
    const cacheKey = "public:sitemap";
    const hit = getCached<string>(cacheKey);
    if (hit) {
      reply.header("Cache-Control", "public, max-age=60");
      return reply.type("application/xml; charset=utf-8").send(hit);
    }

    const items = (await getPublicCatalog(fastify)) as Array<{
      id: string;
      slug?: string;
      published_at?: string;
      created_at?: string;
    }>;
    const siteUrl = getPublicSiteUrl();

    const entries = [
      `<url><loc>${escapeXml(`${siteUrl}/`)}</loc><changefreq>daily</changefreq><priority>1.0</priority></url>`,
      ...items.map((item) => {
        const seoPath = String(item.slug || item.id);
        const publishedAt = item.published_at || item.created_at;
        const lastmod = publishedAt ? `<lastmod>${escapeXml(new Date(publishedAt).toISOString())}</lastmod>` : "";
        return `<url><loc>${escapeXml(`${siteUrl}/files/${seoPath}`)}</loc>${lastmod}<changefreq>weekly</changefreq><priority>0.8</priority></url>`;
      })
    ].join("");

    const xml = `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${entries}</urlset>`;
    setCached(cacheKey, xml);

    reply.header("Cache-Control", "public, max-age=60");
    return reply.type("application/xml; charset=utf-8").send(xml);
  });

  fastify.get("/top-uploaders", async (request, reply) => {
    const cacheKey = "public:top-uploaders";
    const hit = getCached<unknown[]>(cacheKey);
    if (hit) {
      reply.header("Cache-Control", "public, max-age=60");
      return reply.send({ items: hit, cached: true });
    }

    const { data: filesData, error } = await fastify.supabaseAdmin
      .from("files")
      .select("owner_user_id, owner_profile:users_profiles!files_owner_user_id_fkey(auth_user_id)")
      .eq("status", "active")
      .eq("is_public", true);

    if (error) {
      request.log.error({ error }, "Error fetching top uploaders");
      return reply.code(500).send({ error: "Server error" });
    }

    const counts = new Map<string, { count: number; authUserId: string | null }>();
    for (const row of filesData || []) {
      const ownerId = row.owner_user_id;
      // Depending on how supabase returns joined singular objects vs arrays
      const _profile = Array.isArray(row.owner_profile) ? row.owner_profile[0] : row.owner_profile;
      const authUserId = _profile?.auth_user_id || null;
      if (!counts.has(ownerId)) {
        counts.set(ownerId, { count: 1, authUserId });
      } else {
        counts.get(ownerId)!.count++;
      }
    }

    const sorted = Array.from(counts.values()).sort((a, b) => b.count - a.count).slice(0, 3);

    const items = await Promise.all(
      sorted.map(async (st) => {
        let username = "Usuario Anónimo";
        if (st.authUserId) {
          const { data: authUser, error: authErr } = await fastify.supabaseAdmin.auth.admin.getUserById(st.authUserId);
          if (!authErr && authUser?.user?.email) {
            username = authUser.user.email.split("@")[0];
          }
        }
        return { username, count: st.count };
      })
    );

    setCached(cacheKey, items);
    reply.header("Cache-Control", "public, max-age=60");
    return reply.send({ items, cached: false });
  });

  fastify.get("/files", async (_request, reply) => {
    const cacheKey = "public:list";
    const hit = getCached<unknown[]>(cacheKey);
    if (hit) {
      reply.header("Cache-Control", "public, max-age=60");
      return reply.send({ items: hit, cached: true });
    }

    const items = await getPublicCatalog(fastify);
    setCached(cacheKey, items);
    reply.header("Cache-Control", "public, max-age=60");
    return reply.send({ items, cached: false });
  });

  fastify.get("/files/:id", async (request, reply) => {
    const id = (request.params as { id: string }).id;
    const cacheKey = `public:detail:${id}`;
    const hit = getCached<Record<string, unknown>>(cacheKey);
    if (hit) {
      reply.header("Cache-Control", "public, max-age=60");
      return reply.send({ item: hit, cached: true });
    }

    const item = await getPublicCatalogDetail(fastify, id);
    if (!item) return reply.code(404).send({ error: "Not found" });
    setCached(cacheKey, item);
    reply.header("Cache-Control", "public, max-age=60");
    return reply.send({ item, cached: false });
  });

  fastify.get("/files/:id/cover", async (request, reply) => {
    try {
      const id = (request.params as { id: string }).id;
      const item = await getPublicCatalogDetail(fastify, id);
      if (!item) return reply.code(404).send({ error: "Not found" });

      const coverPath = String(item.cover_image_path || "").trim();
      if (/^https?:\/\//i.test(coverPath)) {
        reply.header("Cache-Control", "public, max-age=600");
        return reply.redirect(coverPath);
      }
      const absolute = safeJoin(env.STORAGE_ROOT, coverPath);
      const bytes = await fs.readFile(absolute);
      const ext = path.extname(absolute).toLowerCase();
      const contentType =
        ext === ".png" ? "image/png" : ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" : "image/webp";
      reply.header("Cache-Control", "public, max-age=600");
      return reply.type(contentType).send(bytes);
    } catch (error) {
      request.log.error({ error }, "cover route failed");
      return reply.code(404).send({ error: "Cover not found" });
    }
  });
};
