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

/* ---------- Content reports ---------- */
export type ReportAction = "dismiss" | "delete" | "delete_suspend";
export type ContentReport = {
  id: string;
  kind: "group_message" | "game_question";
  contentId: string;
  authorId: string | null;
  authorName: string;
  text: string;
  reasons: string[];
  reportCount: number;
  status: "open" | "dismissed" | "actioned";
  adminNote: string | null;
  createdAt: string;
};

/** One row per reported message (several reporters collapse into one card). */
export async function listContentReports(): Promise<ContentReport[]> {
  const { data, error } = await supabase
    .from("content_reports")
    .select("id,kind,content_id,author_id,content_text,reason,status,admin_note,created_at")
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw new Error(error.message);
  const rows = data ?? [];
  const authorIds = Array.from(new Set(rows.map((r) => r.author_id).filter(Boolean))) as string[];
  const names = new Map<string, string>();
  if (authorIds.length) {
    const { data: us } = await supabase.from("users").select("id,name").in("id", authorIds);
    for (const u of us ?? []) names.set(u.id, u.name);
  }
  const grouped = new Map<string, ContentReport>();
  for (const r of rows) {
    const key = `${r.kind}:${r.content_id}:${r.status}`;
    const g = grouped.get(key);
    if (g) {
      g.reportCount += 1;
      if (!g.reasons.includes(r.reason)) g.reasons.push(r.reason);
    } else {
      grouped.set(key, {
        id: r.id,
        kind: r.kind,
        contentId: r.content_id,
        authorId: r.author_id,
        authorName: (r.author_id && names.get(r.author_id)) || "Unknown player",
        text: r.content_text,
        reasons: [r.reason],
        reportCount: 1,
        status: r.status,
        adminNote: r.admin_note,
        createdAt: r.created_at,
      });
    }
  }
  return Array.from(grouped.values());
}

export async function resolveReport(id: string, action: ReportAction, note: string) {
  const { error } = await supabase.rpc("admin_resolve_report", { p_id: id, p_action: action, p_note: note });
  if (error) throw new Error(error.message);
}

/* ---------- Site settings ---------- */
export type SiteSettingsForm = {
  supportEmail: string;
  supportPhone: string;
  announcementActive: boolean;
  announcementText: string;
  announcementUrl: string;
  maintenanceMode: boolean;
  maintenanceMessage: string;
};

export async function getSiteSettings(): Promise<SiteSettingsForm> {
  const { data, error } = await supabase.from("site_settings").select("*").eq("id", true).maybeSingle();
  if (error) throw new Error(error.message);
  return {
    supportEmail: data?.support_email ?? "",
    supportPhone: data?.support_phone ?? "",
    announcementActive: data?.announcement_active ?? false,
    announcementText: data?.announcement_text ?? "",
    announcementUrl: data?.announcement_url ?? "",
    maintenanceMode: data?.maintenance_mode ?? false,
    maintenanceMessage: data?.maintenance_message ?? "",
  };
}

export async function saveSiteSettings(f: SiteSettingsForm) {
  const { error } = await supabase.rpc("admin_update_site_settings", {
    p_support_email: f.supportEmail,
    p_support_phone: f.supportPhone,
    p_announcement_active: f.announcementActive,
    p_announcement_text: f.announcementText,
    p_announcement_url: f.announcementUrl,
    p_maintenance_mode: f.maintenanceMode,
    p_maintenance_message: f.maintenanceMessage,
  });
  if (error) {
    const map: Record<string, string> = {
      ANNOUNCEMENT_TEXT_REQUIRED: "Add the announcement text before turning it on.",
      INVALID_URL: "The link must start with https:// or /",
    };
    throw new Error(map[error.message] ?? error.message);
  }
}
