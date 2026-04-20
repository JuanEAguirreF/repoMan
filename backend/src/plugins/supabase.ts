import fp from "fastify-plugin";
import { createClient } from "@supabase/supabase-js";
import { env } from "../config/env.js";

type AppSupabaseClient = any;

export const supabasePlugin = fp(async (fastify) => {
  const supabasePublishable: AppSupabaseClient = createClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false }
  });
  const supabaseAdmin: AppSupabaseClient = createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
    auth: { persistSession: false }
  });

  fastify.decorate("supabasePublishable", supabasePublishable);
  fastify.decorate("supabaseAdmin", supabaseAdmin);
});

declare module "fastify" {
  interface FastifyInstance {
    supabasePublishable: AppSupabaseClient;
    supabaseAdmin: AppSupabaseClient;
  }
}
