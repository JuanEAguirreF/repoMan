import { FastifyPluginAsync } from "fastify";
import fs from "node:fs/promises";
import path from "node:path";
import { env } from "../../config/env.js";
import { safeJoin } from "../../utils/filename.js";
import { getPublicCatalog, getPublicCatalogDetail } from "../files/files.service.js";
import { getCached, setCached } from "./public.cache.js";

export const publicRoutes: FastifyPluginAsync = async (fastify) => {
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
        return reply.redirect(302, coverPath);
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
