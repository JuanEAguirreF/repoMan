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

async function buildServer() {
  const app = Fastify({
    logger: true
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
    credentials: true
  });
  await app.register(multipart, {
    limits: {
      files: 2,
      fileSize: env.MAX_FILE_SIZE_BYTES
    }
  });
  await app.register(supabasePlugin);

  await ensureStorageDirs(env.STORAGE_ROOT);

  app.get("/health", async () => ({ ok: true }));

  await app.register(authRoutes, { prefix: "/api/auth" });
  await app.register(filesRoutes, { prefix: "/api/files" });
  await app.register(deletionRoutes, { prefix: "/api" });
  await app.register(adminRoutes, { prefix: "/api/admin" });
  await app.register(publicRoutes, { prefix: "/api/public" });

  // Fallback map for paths without /api
  await app.register(authRoutes, { prefix: "/auth" });
  await app.register(filesRoutes, { prefix: "/files" });
  await app.register(deletionRoutes); 
  await app.register(adminRoutes, { prefix: "/admin" });
  await app.register(publicRoutes, { prefix: "/public" });

  return app;
}

buildServer()
  .then((app) => app.listen({ port: env.PORT, host: "0.0.0.0" }))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
