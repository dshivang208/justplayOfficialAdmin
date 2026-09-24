/**
 * Real Supabase-backed consumer user queries for Backend Phase C,
 * replacing src/data/users.ts (mock).
 *
 * REAL SCHEMA: public.users has no `city` column (dropped from the real
 * type, same call as partners.ts's email/kycStatus — no fabricated data).
 * `totalBookings`/`totalSpend` aren't stored columns either — they're
 * aggregated here from `bookings`, same as any admin dashboard would need
 * to. totalSpend counts only payment_status = 'paid' bookings (money
 * actually collected and not since refunded) — a 'pending' booking hasn't
 * been paid yet, and a 'refunded' one came back, so neither counts as
 * "spend".
 */
import { supabase } from "@/lib/supabaseClient";

export type UserStatus = "active" | "suspended";

export type AdminUser = {
  id: string;
  name: string;
  phone: string;
  joinDate: string;
  totalBookings: number;
  totalSpend: number;
  status: UserStatus;
  suspensionReason: string | null;
};

type UserRow = {
  id: string;
  name: string;
  phone: string;
  created_at: string;
  status: UserStatus;
  suspension_reason: string | null;
};

type BookingAggRow = { user_id: string; price_paid: number; payment_status: string };

export async function listUsers(): Promise<AdminUser[]> {
  const [usersRes, bookingsRes] = await Promise.all([
    supabase
      .from("users")
      .select("id, name, phone, created_at, status, suspension_reason")
      .order("created_at", { ascending: false })
      .returns<UserRow[]>(),
    supabase.from("bookings").select("user_id, price_paid, payment_status").returns<BookingAggRow[]>(),
  ]);
  if (usersRes.error) throw new Error(usersRes.error.message);
  if (bookingsRes.error) throw new Error(bookingsRes.error.message);

  const bookingCountByUser = new Map<string, number>();
  const spendByUser = new Map<string, number>();
  for (const b of bookingsRes.data ?? []) {
    bookingCountByUser.set(b.user_id, (bookingCountByUser.get(b.user_id) ?? 0) + 1);
    if (b.payment_status === "paid") {
      spendByUser.set(b.user_id, (spendByUser.get(b.user_id) ?? 0) + b.price_paid);
    }
  }

  return (usersRes.data ?? []).map((row) => ({
    id: row.id,
    name: row.name || "Unnamed user",
    phone: row.phone,
    joinDate: row.created_at.slice(0, 10),
    totalBookings: bookingCountByUser.get(row.id) ?? 0,
    totalSpend: spendByUser.get(row.id) ?? 0,
    status: row.status,
    suspensionReason: row.suspension_reason,
  }));
}

export async function getUser(id: string): Promise<AdminUser | null> {
  const { data, error } = await supabase
    .from("users")
    .select("id, name, phone, created_at, status, suspension_reason")
    .eq("id", id)
    .maybeSingle<UserRow>();
  if (error) throw new Error(error.message);
  if (!data) return null;

  const { data: bookingRows, error: bookingsError } = await supabase
    .from("bookings")
    .select("user_id, price_paid, payment_status")
    .eq("user_id", id)
    .returns<BookingAggRow[]>();
  if (bookingsError) throw new Error(bookingsError.message);

  const totalSpend = (bookingRows ?? [])
    .filter((b) => b.payment_status === "paid")
    .reduce((sum, b) => sum + b.price_paid, 0);

  return {
    id: data.id,
    name: data.name || "Unnamed user",
    phone: data.phone,
    joinDate: data.created_at.slice(0, 10),
    totalBookings: bookingRows?.length ?? 0,
    totalSpend,
    status: data.status,
    suspensionReason: data.suspension_reason,
  };
}

// ── Mutations ────────────────────────────────────────────────────────────

export async function suspendUser(userId: string, reason: string) {
  const { data, error } = await supabase.rpc("admin_set_user_status", {
    p_user_id: userId,
    p_status: "suspended",
    p_reason: reason,
  });
  if (error) throw new Error(error.message);
  return data;
}

export async function reactivateUser(userId: string) {
  const { data, error } = await supabase.rpc("admin_set_user_status", {
    p_user_id: userId,
    p_status: "active",
  });
  if (error) throw new Error(error.message);
  return data;
}