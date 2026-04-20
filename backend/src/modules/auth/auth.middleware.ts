import { FastifyReply, FastifyRequest } from "fastify";
import type { AppRole } from "../../types/app-role.js";

function unauthorized(reply: FastifyReply, message = "Unauthorized") {
  return reply.code(401).send({ error: message });
}

function parseRole(value: unknown): AppRole {
  return value === "super_admin" || value === "uploader" ? value : "uploader";
}

function deriveDisplayName(user: { email?: string | null; user_metadata?: Record<string, unknown> }): string {
  const fromMeta = user.user_metadata?.display_name;
  if (typeof fromMeta === "string" && fromMeta.trim().length > 0) return fromMeta.trim();
  const fromEmail = user.email?.split("@")[0];
  if (fromEmail && fromEmail.trim().length > 0) return fromEmail.trim();
  return "User";
}

async function findProfileByAuthUserId(request: FastifyRequest, authUserId: string) {
  const { data, error } = await request.server.supabaseAdmin
    .from("users_profiles")
    .select("id,auth_user_id,role,display_name")
    .eq("auth_user_id", authUserId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function waitAndRetryProfileLookup(request: FastifyRequest, authUserId: string, attempts = 3) {
  for (let i = 0; i < attempts; i += 1) {
    const profile = await findProfileByAuthUserId(request, authUserId);
    if (profile) return profile;
    await new Promise((resolve) => setTimeout(resolve, 120));
  }
  return null;
}

export async function requireAuth(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const authHeader = request.headers.authorization;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : undefined;

  if (!token) {
    unauthorized(reply);
    return;
  }

  const { data: userData, error: userErr } = await request.server.supabasePublishable.auth.getUser(token);
  if (userErr || !userData.user) {
    unauthorized(reply, "Invalid token");
    return;
  }

  let existingProfile: Awaited<ReturnType<typeof findProfileByAuthUserId>> = null;
  try {
    existingProfile = await findProfileByAuthUserId(request, userData.user.id);
  } catch {
    unauthorized(reply, "Profile lookup failed");
    return;
  }

  let profile = existingProfile;
  if (!profile) {
    const roleFromMeta = parseRole(
      (userData.user.app_metadata as Record<string, unknown> | undefined)?.role ??
        (userData.user.user_metadata as Record<string, unknown> | undefined)?.role
    );
    const displayName = deriveDisplayName({
      email: userData.user.email,
      user_metadata: userData.user.user_metadata as Record<string, unknown> | undefined
    });

    const { data: createdProfile, error: createErr } = await request.server.supabaseAdmin
      .from("users_profiles")
      .insert({
        auth_user_id: userData.user.id,
        role: roleFromMeta,
        display_name: displayName
      })
      .select("id,auth_user_id,role,display_name")
      .single();

    if (!createErr && createdProfile) {
      profile = createdProfile;
    } else {
      const racedProfile = await waitAndRetryProfileLookup(request, userData.user.id, 4);
      if (!racedProfile) {
        unauthorized(reply, "Profile provisioning failed");
        return;
      }
      profile = racedProfile;
    }
  }

  request.authUser = {
    profileId: profile.id,
    authUserId: profile.auth_user_id,
    role: profile.role as AppRole,
    displayName: profile.display_name
  };
}

export function requireRole(...allowedRoles: AppRole[]) {
  return async function roleGuard(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    if (!request.authUser) {
      unauthorized(reply);
      return;
    }
    if (!allowedRoles.includes(request.authUser.role)) {
      reply.code(403).send({ error: "Forbidden" });
    }
  };
}
