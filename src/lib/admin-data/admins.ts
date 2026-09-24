/**
 * Real Supabase-backed admin team queries for Backend Phase E, replacing
 * src/data/admins.ts (mock).
 *
 * "Invited" vs "Active" is now real: admin_users.last_login_at is null
 * until admin-otp-verify records a first successful login (Phase E),
 * instead of a fixed mock status. Inviting someone actually provisions
 * their auth identity (admin-invite-admin, service role — can't be done
 * from a plain RPC), matching what admin-otp-verify's own Phase A
 * comments already anticipated.
 */
import { supabase } from "@/lib/supabaseClient";
import type { AdminRole } from "@/lib/admin-auth";

export type AdminTeamMember = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  role: AdminRole;
  status: "active" | "invited";
  addedDate: string;
};

type AdminRow = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  role: "super_admin" | "ops_support";
  last_login_at: string | null;
  created_at: string;
};

function dbRoleToDisplay(role: "super_admin" | "ops_support"): AdminRole {
  return role === "super_admin" ? "Super Admin" : "Ops/Support";
}

function displayRoleToDb(role: AdminRole): "super_admin" | "ops_support" {
  return role === "Super Admin" ? "super_admin" : "ops_support";
}

export async function listAdminTeam(): Promise<AdminTeamMember[]> {
  const { data, error } = await supabase
    .from("admin_users")
    .select("id, name, phone, email, role, last_login_at, created_at")
    .order("created_at", { ascending: true })
    .returns<AdminRow[]>();
  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    phone: row.phone,
    email: row.email,
    role: dbRoleToDisplay(row.role),
    status: row.last_login_at ? "active" : "invited",
    addedDate: row.created_at.slice(0, 10),
  }));
}

export async function inviteAdmin(input: { name: string; phone: string; role: AdminRole }) {
  const { data, error } = await supabase.functions.invoke<{ admin: AdminRow }>("admin-invite-admin", {
    body: { name: input.name, phone: input.phone, role: displayRoleToDb(input.role) },
  });
  if (error) throw new Error(error.message);
  if (!data?.admin) throw new Error("Could not invite this admin.");
  return data.admin;
}

export async function changeAdminRole(id: string, role: AdminRole) {
  const { error } = await supabase.rpc("admin_update_role", {
    p_admin_id: id,
    p_role: displayRoleToDb(role),
  });
  if (error) throw new Error(error.message);
}

export async function removeAdmin(id: string) {
  const { error } = await supabase.rpc("admin_remove_admin", { p_admin_id: id });
  if (error) throw new Error(error.message);
}