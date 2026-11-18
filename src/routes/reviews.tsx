import { useCallback, useEffect, useMemo, useState } from "react";
import { EyeOff, Loader2, Search, Star, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AdminShell } from "@/components/admin/AdminShell";
import { ExportCsvButton } from "@/components/admin/ExportCsvButton";
import { deleteReview, listAdminReviews, setReviewHidden, type AdminReview } from "@/lib/admin-data/opsTools";

function fmt(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function Stars({ n }: { n: number }) {
  return (
    <span className="inline-flex gap-0.5" aria-label={`${n} out of 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} className={"h-3.5 w-3.5 " + (i <= n ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40")} />
      ))}
    </span>
  );
}

export function ReviewsModerationPage() {
  const [items, setItems] = useState<AdminReview[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"all" | "low" | "hidden">("all");
  const [q, setQ] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setItems(await listAdminReviews());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load reviews.");
    }
  }, []);
  useEffect(() => void load(), [load]);

  const visible = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (items ?? [])
      .filter((r) => (tab === "all" ? true : tab === "hidden" ? r.isHidden : r.rating <= 2))
      .filter((r) => !s || (r.body ?? "").toLowerCase().includes(s) || r.authorName.toLowerCase().includes(s) || r.venueName.toLowerCase().includes(s));
  }, [items, tab, q]);

  const act = async (id: string, fn: () => Promise<void>, ok: string) => {
    setBusyId(id);
    try {
      await fn();
      toast.success(ok);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Action failed.");
    } finally {
      setBusyId(null);
    }
  };

  const hide = (r: AdminReview) => {
    const reason = window.prompt("Reason for hiding this review (required, shown only to admins):");
    if (reason === null) return;
    void act(r.id, () => setReviewHidden(r.id, true, reason), "Review hidden");
  };
  const remove = (r: AdminReview) => {
    const reason = window.prompt("Permanently delete this review? Enter a reason:");
    if (reason === null) return;
    void act(r.id, () => deleteReview(r.id, reason), "Review deleted");
  };

  const tabs = [
    { id: "all", label: "All" },
    { id: "low", label: "Low rated (1–2★)" },
    { id: "hidden", label: "Hidden" },
  ] as const;

  return (
    <AdminShell>
      <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-semibold text-foreground">Reviews</h1>
            <p className="mt-1 text-sm text-muted-foreground">Hide or remove abusive or fake reviews. Hidden reviews don't count towards a venue's rating.</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative w-52">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search"
                className="h-9 w-full rounded-lg border border-input bg-background pl-9 pr-3 text-sm outline-none focus:border-primary" />
            </div>
            <ExportCsvButton
              filename="justplay-reviews"
              disabled={!items?.length}
              headers={["Date", "Venue", "Author", "Rating", "Review", "Hidden", "Hidden reason", "Partner reply"]}
              getRows={() => (items ?? []).map((r) => [r.createdAt, r.venueName, r.authorName, r.rating, r.body ?? "", r.isHidden ? "yes" : "no", r.hiddenReason ?? "", r.partnerReply ?? ""])}
            />
          </div>
        </div>
        <div className="mt-5 flex flex-wrap gap-1.5">
          {tabs.map((t) => (
            <button key={t.id} type="button" onClick={() => setTab(t.id)}
              className={"rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors " +
                (tab === t.id ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground")}>
              {t.label}
            </button>
          ))}
        </div>
        <div className="mt-4">
          {error ? (
            <div className="surface-card rounded-xl p-6 text-sm text-destructive">{error}</div>
          ) : items === null ? (
            <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : visible.length === 0 ? (
            <div className="surface-card rounded-xl p-10 text-center text-sm text-muted-foreground">No reviews here.</div>
          ) : (
            <ul className="space-y-3">
              {visible.map((r) => (
                <li key={r.id} className={"surface-card rounded-xl p-4 " + (r.isHidden ? "opacity-70" : "")}>
                  <div className="flex flex-wrap items-center gap-2">
                    <Stars n={r.rating} />
                    <span className="text-sm font-semibold text-foreground">{r.venueName}</span>
                    {r.isHidden ? <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">Hidden</span> : null}
                    <span className="ml-auto text-xs text-muted-foreground">{fmt(r.createdAt)}</span>
                  </div>
                  <p className="mt-2 whitespace-pre-wrap break-words text-sm text-foreground">{r.body || <em className="text-muted-foreground">No written review</em>}</p>
                  <p className="mt-1.5 text-xs text-muted-foreground">by {r.authorName}</p>
                  {r.hiddenReason ? <p className="mt-1 text-xs text-muted-foreground">Hidden because: {r.hiddenReason}</p> : null}
                  {r.partnerReply ? <p className="mt-2 rounded-lg bg-secondary p-2.5 text-xs text-muted-foreground"><span className="font-semibold text-foreground">Venue reply: </span>{r.partnerReply}</p> : null}
                  <div className="mt-3 flex gap-2">
                    {r.isHidden ? (
                      <button type="button" disabled={busyId === r.id}
                        onClick={() => void act(r.id, () => setReviewHidden(r.id, false, ""), "Review restored")}
                        className="rounded-full border border-border px-3 py-1 text-xs font-semibold hover:border-primary hover:text-primary">Restore</button>
                    ) : (
                      <button type="button" disabled={busyId === r.id} onClick={() => hide(r)}
                        className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1 text-xs font-semibold hover:border-primary hover:text-primary">
                        <EyeOff className="h-3.5 w-3.5" /> Hide
                      </button>
                    )}
                    <button type="button" disabled={busyId === r.id} onClick={() => remove(r)}
                      className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1 text-xs font-semibold text-destructive hover:border-destructive">
                      <Trash2 className="h-3.5 w-3.5" /> Delete
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </AdminShell>
  );
}
