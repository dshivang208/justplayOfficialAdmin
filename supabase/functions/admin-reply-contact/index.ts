// JustPlay Admin — admin-reply-contact
//
// Emails a reply to a Contact Us message straight from the admin inbox, then
// marks the message "in progress" (or "resolved") and writes an audit entry.
// Secrets: RESEND_API_KEY, EMAIL_FROM (+ the usual admin auth secrets).

import { requireAdmin, json, corsHeaders } from "../_shared/adminAuth.ts";
import { renderEmail, sendEmail } from "../_shared/email.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const auth = await requireAdmin(req);
  if ("error" in auth) return json({ error: auth.error }, auth.status);
  const { admin, serviceClient } = auth;

  let b: { submissionId?: unknown; reply?: unknown; resolve?: unknown };
  try {
    b = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  const id = typeof b.submissionId === "string" ? b.submissionId : "";
  const reply = typeof b.reply === "string" ? b.reply.trim() : "";
  if (!id || reply.length < 2 || reply.length > 3000) return json({ error: "A reply of 2–3000 characters is required." }, 400);

  const { data: sub, error } = await serviceClient
    .from("contact_submissions").select("id,name,email,message").eq("id", id).maybeSingle();
  if (error || !sub) return json({ error: "Message not found." }, 404);

  const html = renderEmail({
    heading: `Hi ${sub.name || "there"},`,
    lines: [reply, `— The JustPlay team`, `Your original message:\n“${sub.message.slice(0, 500)}”`],
    footer: "You're receiving this because you contacted JustPlay support. Just reply to this email to continue the conversation.",
  });
  const r = await sendEmail(sub.email, "Re: your message to JustPlay", html);
  if (!r.ok) return json({ error: r.error ?? "Could not send the email." }, 502);

  const status = b.resolve === true ? "resolved" : "in_progress";
  await serviceClient.from("contact_submissions")
    .update({ status, handled_by: admin.id, updated_at: new Date().toISOString() }).eq("id", id);
  await serviceClient.from("admin_audit_log").insert({
    admin_id: admin.id, action: "contact_submission.reply", target_table: "contact_submissions",
    target_id: id, details: { status },
  });
  return json({ ok: true, status });
});
