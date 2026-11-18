import { supabase } from "@/lib/supabaseClient";

/* ---------- Contact inbox ---------- */
export type ContactStatus = "new" | "in_progress" | "resolved";
export type ContactMessage = {
  id: string;
  name: string;
  email: string;
  message: string;
  userId: string | null;
  status: ContactStatus;
  adminNote: string | null;
  createdAt: string;
};

export async function listContactMessages(): Promise<ContactMessage[]> {
  const { data, error } = await supabase
    .from("contact_submissions")
    .select("id,name,email,message,user_id,status,admin_note,created_at")
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    email: r.email,
    message: r.message,
    userId: r.user_id,
    status: r.status as ContactStatus,
    adminNote: r.admin_note,
    createdAt: r.created_at,
  }));
}

export async function updateContactMessage(id: string, status: ContactStatus, note: string) {
  const { error } = await supabase.rpc("admin_update_contact_submission", {
    p_id: id,
    p_status: status,
    p_note: note,
  });
  if (error) throw new Error(error.message);
}

/* ---------- Reviews moderation ---------- */
export type AdminReview = {
  id: string;
  venueId: string;
  venueName: string;
  authorName: string;
  rating: number;
  body: string | null;
  createdAt: string;
  isHidden: boolean;
  hiddenReason: string | null;
  partnerReply: string | null;
};

export async function listAdminReviews(): Promise<AdminReview[]> {
  const { data, error } = await supabase
    .from("reviews")
    .select(
      "id,venue_id,author_name,rating,body,created_at,is_hidden,hidden_reason,partner_reply,venues(name)",
    )
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw new Error(error.message);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((data ?? []) as any[]).map((r) => ({
    id: r.id,
    venueId: r.venue_id,
    venueName: r.venues?.name ?? "Venue",
    authorName: r.author_name,
    rating: r.rating,
    body: r.body,
    createdAt: r.created_at,
    isHidden: r.is_hidden,
    hiddenReason: r.hidden_reason,
    partnerReply: r.partner_reply,
  }));
}

export async function setReviewHidden(id: string, hidden: boolean, reason: string) {
  const { error } = await supabase.rpc("admin_set_review_hidden", {
    p_id: id,
    p_hidden: hidden,
    p_reason: reason,
  });
  if (error) throw new Error(error.message === "REASON_REQUIRED" ? "Please add a reason." : error.message);
}

export async function deleteReview(id: string, reason: string) {
  const { error } = await supabase.rpc("admin_delete_review", { p_id: id, p_reason: reason });
  if (error) throw new Error(error.message);
}

/* ---------- Audit log ---------- */
export type AuditEntry = {
  id: string;
  adminId: string | null;
  adminName: string;
  action: string;
  targetTable: string;
  targetId: string;
  details: Record<string, unknown>;
  createdAt: string;
};

export async function listAuditLog(limit = 500): Promise<AuditEntry[]> {
  const [logRes, namesRes] = await Promise.all([
    supabase
      .from("admin_audit_log")
      .select("id,admin_id,action,target_table,target_id,details,created_at")
      .order("created_at", { ascending: false })
      .limit(limit),
    supabase.rpc("admin_team_names"),
  ]);
  if (logRes.error) throw new Error(logRes.error.message);
  const names = new Map<string, string>(
    ((namesRes.data ?? []) as { id: string; name: string }[]).map((n) => [n.id, n.name]),
  );
  return (logRes.data ?? []).map((r) => ({
    id: r.id,
    adminId: r.admin_id,
    adminName: r.admin_id ? (names.get(r.admin_id) || "Admin") : "System",
    action: r.action,
    targetTable: r.target_table,
    targetId: r.target_id,
    details: (r.details ?? {}) as Record<string, unknown>,
    createdAt: r.created_at,
  }));
}
