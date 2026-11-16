import { supabase } from "@/lib/supabaseClient";

export type SuggestionStatus = "new" | "reviewed" | "planned" | "done" | "dismissed";
export type SuggestionCategory = "feature" | "venue" | "app" | "booking" | "other";

export const SUGGESTION_STATUS_LABELS: Record<SuggestionStatus, string> = {
  new: "New",
  reviewed: "Reviewed",
  planned: "Planned",
  done: "Done",
  dismissed: "Dismissed",
};

export const SUGGESTION_CATEGORY_LABELS: Record<SuggestionCategory, string> = {
  feature: "New feature",
  venue: "Venue / sport",
  booking: "Booking & payments",
  app: "App experience",
  other: "Other",
};

export type Suggestion = {
  id: string;
  userId: string | null;
  name: string;
  email: string | null;
  category: SuggestionCategory;
  message: string;
  status: SuggestionStatus;
  adminNote: string | null;
  createdAt: string;
};

type Row = {
  id: string;
  user_id: string | null;
  name: string;
  email: string | null;
  category: SuggestionCategory;
  message: string;
  status: SuggestionStatus;
  admin_note: string | null;
  created_at: string;
};

export async function listSuggestions(): Promise<Suggestion[]> {
  const { data, error } = await supabase
    .from("suggestions")
    .select("id,user_id,name,email,category,message,status,admin_note,created_at")
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw new Error(error.message);
  return ((data ?? []) as Row[]).map((r) => ({
    id: r.id,
    userId: r.user_id,
    name: r.name,
    email: r.email,
    category: r.category,
    message: r.message,
    status: r.status,
    adminNote: r.admin_note,
    createdAt: r.created_at,
  }));
}

export async function updateSuggestion(
  id: string,
  patch: { status?: SuggestionStatus; adminNote?: string | null },
): Promise<void> {
  const row: Record<string, unknown> = {};
  if (patch.status !== undefined) row.status = patch.status;
  if (patch.adminNote !== undefined) row.admin_note = patch.adminNote;
  const { error } = await supabase.from("suggestions").update(row).eq("id", id);
  if (error) throw new Error(error.message);
}
