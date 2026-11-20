// Shared email helpers (Resend). Copy of this file lives in the admin project's
// supabase/functions/_shared too — keep both in sync.
//
// Secrets:  RESEND_API_KEY, EMAIL_FROM (e.g. "JustPlay <noreply@yourdomain.com>")
//           APP_URL (consumer site URL, used for button links)

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const EMAIL_FROM = Deno.env.get("EMAIL_FROM");

export const APP_URL = (Deno.env.get("APP_URL") ?? "").replace(/\/$/, "");

const esc = (t: string) =>
  t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Branded, table-based HTML (works in Gmail/Outlook). All dynamic text is escaped. */
export function renderEmail(opts: {
  heading: string;
  lines: string[];
  ctaText?: string;
  ctaUrl?: string;
  footer?: string;
}): string {
  const paras = opts.lines
    .filter(Boolean)
    .map((l) => `<p style="margin:0 0 12px;font-size:15px;line-height:1.55;color:#0c121a">${esc(l).replace(/\n/g, "<br>")}</p>`)
    .join("");
  const cta =
    opts.ctaText && opts.ctaUrl
      ? `<p style="margin:22px 0 4px"><a href="${esc(opts.ctaUrl)}" style="background:#108846;color:#fff;text-decoration:none;font-weight:700;font-size:14px;padding:12px 22px;border-radius:999px;display:inline-block">${esc(opts.ctaText)}</a></p>`
      : "";
  return `<!doctype html><html><body style="margin:0;background:#f4f5f2;font-family:Arial,Helvetica,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#fff;border-radius:16px;overflow:hidden">
<tr><td style="background:#074a24;padding:20px 28px"><span style="color:#fff;font-size:20px;font-weight:700;letter-spacing:.3px">Just</span><span style="color:#f4c48d;font-size:20px;font-weight:700">Play</span></td></tr>
<tr><td style="height:4px;background:linear-gradient(90deg,#108846,#d4822b)"></td></tr>
<tr><td style="padding:28px">
<h1 style="margin:0 0 16px;font-size:22px;color:#074a24">${esc(opts.heading)}</h1>${paras}${cta}
</td></tr>
<tr><td style="padding:16px 28px;background:#fafaf7;font-size:12px;color:#5d646e">${esc(opts.footer ?? "You're receiving this because of activity on your JustPlay account.")}</td></tr>
</table></td></tr></table></body></html>`;
}

export async function sendEmail(to: string, subject: string, html: string): Promise<{ ok: boolean; error?: string }> {
  if (!RESEND_API_KEY || !EMAIL_FROM) return { ok: false, error: "RESEND_API_KEY / EMAIL_FROM not configured" };
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: EMAIL_FROM, to: [to], subject, html }),
    });
    if (res.ok) return { ok: true };
    const out = await res.json().catch(() => null);
    return { ok: false, error: out?.message ?? `Resend returned ${res.status}` };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Email send failed" };
  }
}
