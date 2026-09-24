// Shared by every admin-* Edge Function in Backend Phases B-E.
//
// The pattern every one of these functions follows, per Phase A's rule
// ("route sensitive admin writes through Edge Functions that check the
// admin's role server-side before executing"):
//   1. Read the caller's own access token from the Authorization header
//      Supabase sent along automatically — this identifies WHO is
//      calling, using their real session, not a shared secret.
//   2. Look up their public.admin_users row with the SERVICE ROLE client
//      (bypassing RLS deliberately, exactly once, exactly for this one
//      lookup) to find out WHAT they're allowed to do.
//   3. Reject if they're not an admin at all, or not the required role.
//   4. Only past that point does the function use the service-role
//      client to perform the actual privileged write.
//
// No function in this app ever trusts a role or admin id sent in the
// request BODY — that would let anyone claim to be a super_admin by
// editing the request. The only source of truth for "who is this and
// what are they allowed to do" is steps 1-2 above.

import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

export const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
export const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
export const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export type CallingAdmin = {
  id: string;
  name: string;
  role: "super_admin" | "ops_support";
};

/**
 * Resolves the calling admin from the request's own Authorization header.
 * Returns null (and the caller should respond 401/403) if there's no
 * valid session, or no matching admin_users row, or — when
 * `requireSuperAdmin` is set — the row exists but isn't super_admin.
 */
export async function requireAdmin(
  req: Request,
  opts: { requireSuperAdmin?: boolean } = {},
): Promise<{ admin: CallingAdmin; serviceClient: SupabaseClient } | { error: string; status: number }> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return { error: "Missing Authorization header.", status: 401 };

  // Scoped to the caller's own token — used ONLY to ask "who is this?".
  const callerClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const {
    data: { user },
    error: userError,
  } = await callerClient.auth.getUser();

  if (userError || !user) return { error: "Not signed in.", status: 401 };

  // Service role from here on — this is the one deliberate, narrowly-
  // scoped bypass, used only to look up the admin_users row and then to
  // perform the actual write this function exists to do.
  const serviceClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: adminRow, error: adminError } = await serviceClient
    .from("admin_users")
    .select("id, name, role")
    .eq("id", user.id)
    .maybeSingle();

  if (adminError) return { error: adminError.message, status: 500 };
  if (!adminRow) return { error: "This account doesn't have admin access.", status: 403 };

  if (opts.requireSuperAdmin && adminRow.role !== "super_admin") {
    return { error: "This action is restricted to Super Admin.", status: 403 };
  }

  return {
    admin: { id: adminRow.id, name: adminRow.name, role: adminRow.role as CallingAdmin["role"] },
    serviceClient,
  };
}

/** Every privileged action writes its own audit row — see admin_audit_log's
 * table comment in the Phase A migration for why this isn't the trigger's job. */
export async function logAdminAction(
  serviceClient: SupabaseClient,
  entry: { adminId: string; action: string; targetTable: string; targetId: string; details?: unknown },
) {
  const { error } = await serviceClient.from("admin_audit_log").insert({
    admin_id: entry.adminId,
    action: entry.action,
    target_table: entry.targetTable,
    target_id: entry.targetId,
    details: entry.details ?? {},
  });
  if (error) console.error("Failed to write admin_audit_log:", error.message);
}
