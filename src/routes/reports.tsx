import { useCallback, useEffect, useMemo, useState } from "react";
import { Flag, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { AdminShell } from "@/components/admin/AdminShell";
import { ExportCsvButton } from "@/components/admin/ExportCsvButton";
import { listContentReports, resolveReport, type ContentReport, type ReportAction } from "@/lib/admin-data/opsTools";

const KIND: Record<ContentReport["kind"], string> = { group_message: "Group chat", game_question: "Game Q&A" };
const REASON: Record<string, string> = {
  spam: "Spam", abuse: "Abusive language", harassment: "Harassment", inappropriate: "Inappropriate", other: "Other",
};
function fmt(iso: string) {
  return new Date(iso).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "numeric", minute: "2-digit" });
}

export function ReportsPage() {
  const [items, setItems] = useState<ContentReport[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"open" | "done">("open");
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setItems(await listContentReports());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load reports.");
    }
  }, []);
  useEffect(() => void load(), [load]);

  const visible = useMemo(
    () => (items ?? []).filter((r) => (tab === "open" ? r.status === "open" : r.status !== "open")),
    [items, tab],
  );
  const openCount = (items ?? []).filter((r) => r.status === "open").length;

  const act = async (r: ContentReport, action: ReportAction) => {
    const prompts: Record<ReportAction, string | null> = {
      dismiss: "Optional note (why this is fine):",
      delete: "Optional note for the log:",
      delete_suspend: "Reason for suspending this player (shown to them):",
    };
    const note = window.prompt(prompts[action] ?? "");
    if (note === null) return;
    if (action === "delete_suspend" && !window.confirm(`Delete this message AND suspend ${r.authorName}?`)) return;
    setBusy(r.id);
    try {
      await resolveReport(r.id, action, note);
      toast.success(action === "dismiss" ? "Report dismissed" : action === "delete" ? "Message deleted" : "Message deleted, player suspended");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Action failed.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <AdminShell>
      <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-semibold text-foreground">Reported Content</h1>
            <p className="mt-1 text-sm text-muted-foreground">Messages players flagged in group chats and game Q&amp;A.</p>
          </div>
          <ExportCsvButton
            filename="justplay-reports"
            disabled={!items?.length}
            headers={["Date", "Where", "Author", "Message", "Reasons", "Reports", "Status", "Note"]}
            getRows={() => (items ?? []).map((r) => [r.createdAt, KIND[r.kind], r.authorName, r.text, r.reasons.join("; "), r.reportCount, r.status, r.adminNote ?? ""])}
          />
        </div>
        <div className="mt-5 flex gap-1.5">
          {([["open", `Open${openCount ? ` (${openCount})` : ""}`], ["done", "Resolved"]] as const).map(([id, label]) => (
            <button key={id} type="button" onClick={() => setTab(id)}
              className={"rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors " +
                (tab === id ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground")}>
              {label}
            </button>
          ))}
        </div>
        <div className="mt-4">
          {error ? (
            <div className="surface-card rounded-xl p-6 text-sm text-destructive">{error}</div>
          ) : items === null ? (
            <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : visible.length === 0 ? (
            <div className="surface-card flex flex-col items-center gap-2 rounded-xl p-10 text-center">
              <Flag className="h-5 w-5 text-muted-foreground" />
              <p className="text-sm font-medium text-foreground">{tab === "open" ? "No open reports. All clear." : "Nothing resolved yet."}</p>
            </div>
          ) : (
            <ul className="space-y-3">
              {visible.map((r) => (
                <li key={r.id} className="surface-card rounded-xl p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full border border-border px-2.5 py-0.5 text-[11px] font-semibold text-muted-foreground">{KIND[r.kind]}</span>
                    {r.reasons.map((x) => (
                      <span key={x} className="rounded-full bg-destructive/10 px-2.5 py-0.5 text-[11px] font-semibold text-destructive">{REASON[x] ?? x}</span>
                    ))}
                    {r.reportCount > 1 ? <span className="text-xs font-semibold text-foreground">{r.reportCount} reports</span> : null}
                    <span className="ml-auto text-xs text-muted-foreground">{fmt(r.createdAt)}</span>
                  </div>
                  <blockquote className="mt-3 whitespace-pre-wrap break-words rounded-lg bg-secondary p-3 text-sm text-foreground">{r.text}</blockquote>
                  <p className="mt-2 text-xs text-muted-foreground">Posted by <span className="font-semibold text-foreground">{r.authorName}</span></p>
                  {r.status !== "open" ? (
                    <p className="mt-2 text-xs text-muted-foreground">
                      {r.status === "dismissed" ? "Dismissed" : "Action taken"}{r.adminNote ? ` — ${r.adminNote}` : ""}
                    </p>
                  ) : (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button type="button" disabled={busy === r.id} onClick={() => void act(r, "dismiss")}
                        className="rounded-full border border-border px-3 py-1 text-xs font-semibold hover:border-primary hover:text-primary">Dismiss</button>
                      <button type="button" disabled={busy === r.id} onClick={() => void act(r, "delete")}
                        className="rounded-full border border-border px-3 py-1 text-xs font-semibold text-destructive hover:border-destructive">Delete message</button>
                      <button type="button" disabled={busy === r.id} onClick={() => void act(r, "delete_suspend")}
                        className="rounded-full bg-destructive px-3 py-1 text-xs font-semibold text-destructive-foreground">Delete &amp; suspend player</button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </AdminShell>
  );
}
