import Fastify from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import { env } from "./config/env.js";
import { supabasePlugin } from "./plugins/supabase.js";
import { ensureStorageDirs } from "./utils/storage.js";
import { authRoutes } from "./modules/auth/auth.routes.js";
import { filesRoutes } from "./modules/files/files.routes.js";
import { publicRoutes } from "./modules/public/public.routes.js";
import { deletionRoutes } from "./modules/deletion/deletion.routes.js";
import { adminRoutes } from "./modules/admin/admin.routes.js";
import { editRoutes } from "./modules/edit/edit.routes.js";
import { usersRoutes } from "./modules/users/users.routes.js";
import { usersPublicRoutes } from "./modules/users/users.public.routes.js";
import { ensureAvatarDir } from "./modules/users/avatar.storage.js";

type Bucket = { resetAt: number; count: number };
const ipBuckets = new Map<string, Bucket>();

function readClientIp(request: { ip: string; headers: Record<string, unknown> }) {
  const forwarded = String(request.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return forwarded || request.ip || "unknown";
}

function ratePlanForRequest(method: string, url: string) {
  if (url.startsWith("/api/public/") || url.startsWith("/public/")) return { max: 180, windowMs: 60_000, key: "public" };
  if ((url === "/api/files" || url === "/files") && method === "POST") return { max: 12, windowMs: 10 * 60_000, key: "upload" };
  if (url.endsWith("/auth/session")) return { max: 90, windowMs: 60_000, key: "auth" };
  return { max: 320, windowMs: 60_000, key: "default" };
}

async function buildServer() {
  const app = Fastify({
    logger: true,
    bodyLimit: 12 * 1024 * 1024
  });

  app.addContentTypeParser(/^application\/octet-stream(?:;.*)?$/i, { parseAs: "buffer" }, (_request, body, done) => {
    done(null, body);
  });

  app.addHook("onRequest", async (request, reply) => {
    const plan = ratePlanForRequest(request.method, request.url);
    const ip = readClientIp(request as unknown as { ip: string; headers: Record<string, unknown> });
    const key = `${plan.key}:${ip}`;
    const now = Date.now();
    const current = ipBuckets.get(key);

    if (!current || now >= current.resetAt) {
      ipBuckets.set(key, { count: 1, resetAt: now + plan.windowMs });
      return;
    }
    if (current.count >= plan.max) {
      reply.code(429).send({ error: "Too Many Requests" });
      return;
    }
    current.count += 1;
  });

  await app.register(cors, {
    origin: (origin, cb) => {
      if (!origin) {
        cb(null, true);
        return;
      }
      
      const allowed = ["https://repoman.comunidaddelmanga.com", "http://localhost:5173"];
      const envOrigins = env.FRONTEND_ORIGIN.split(',').map((o: string) => o.trim().replace(/\/$/, ""));
      
      if (allowed.includes(origin) || envOrigins.includes(origin)) {
        cb(null, true);
        return;
      }
      
      cb(new Error("Not allowed by CORS"), false);
    },
    credentials: true,
    methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Authorization", "Content-Type", "Accept", "Origin", "X-Requested-With"]
  });
  await app.register(multipart, {
    limits: {
      files: 2,
      fileSize: env.MAX_FILE_SIZE_BYTES
    }
  });
  await app.register(supabasePlugin);

  await ensureStorageDirs(env.STORAGE_ROOT);
  await ensureAvatarDir();

  app.get("/health", async () => ({ ok: true }));

  await app.register(authRoutes, { prefix: "/api/auth" });
  await app.register(filesRoutes, { prefix: "/api/files" });
  await app.register(deletionRoutes, { prefix: "/api" });
  await app.register(editRoutes, { prefix: "/api" });
  await app.register(adminRoutes, { prefix: "/api/admin" });
  await app.register(publicRoutes, { prefix: "/api/public" });
  await app.register(usersRoutes, { prefix: "/api/users" });
  await app.register(usersPublicRoutes, { prefix: "/api/public" });

  // Fallback map for paths without /api
  await app.register(authRoutes, { prefix: "/auth" });
  await app.register(filesRoutes, { prefix: "/files" });
  await app.register(deletionRoutes); 
  await app.register(editRoutes);
  await app.register(adminRoutes, { prefix: "/admin" });
  await app.register(publicRoutes, { prefix: "/public" });
  await app.register(usersRoutes, { prefix: "/users" });
  await app.register(usersPublicRoutes, { prefix: "/public" });

  return app;
}

buildServer()
  .then((app) => app.listen({ port: env.PORT, host: "0.0.0.0" }))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
