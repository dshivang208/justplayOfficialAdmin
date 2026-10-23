import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Headset, Loader2, Search } from "lucide-react";
import { AdminShell } from "@/components/admin/AdminShell";
import { TicketPriorityBadge, TicketStatusBadge } from "@/components/admin/StatusBadge";
import { supabase } from "@/lib/supabaseClient";
import {
  CATEGORY_LABELS,
  getSupportCounts,
  listTickets,
  type SupportCounts,
  type SupportTicket,
} from "@/lib/admin-data/support";

type Tab = "needs_reply" | "open" | "waiting" | "resolved" | "all";
type Source = "all" | "player" | "partner";

const PRIORITY_RANK = { urgent: 0, high: 1, normal: 2, low: 3 } as const;

function timeAgo(iso: string) {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
}

export function SupportInboxPage() {
  const [tickets, setTickets] = useState<SupportTicket[] | null>(null);
  const [counts, setCounts] = useState<SupportCounts | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("needs_reply");
  const [query, setQuery] = useState("");
  const [source, setSource] = useState<Source>("all");

  const load = useCallback(async () => {
    try {
      const [t, c] = await Promise.all([listTickets(), getSupportCounts()]);
      setTickets(t);
      setCounts(c);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load tickets.");
    }
  }, []);

  useEffect(() => {
    void load();
    // New tickets and replies show up without a refresh.
    const channel = supabase
      .channel("admin-support-inbox")
      .on("postgres_changes", { event: "*", schema: "public", table: "support_tickets" }, () => void load())
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [load]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase().replace(/^#/, "");
    return (tickets ?? [])
      .filter((t) => {
        if (tab === "needs_reply")
          return t.lastSenderKind === "user" && (t.status === "open" || t.status === "in_progress");
        if (tab === "open") return t.status === "open" || t.status === "in_progress";
        if (tab === "waiting") return t.status === "waiting_user";
        if (tab === "resolved") return t.status === "resolved" || t.status === "closed";
        return true;
      })
      .filter((t) => source === "all" || t.source === source)
      .filter(
        (t) =>
          !q ||
          (t.venueName ?? "").toLowerCase().includes(q) ||
          String(t.ticketNo) === q ||
          t.subject.toLowerCase().includes(q) ||
          t.userName.toLowerCase().includes(q) ||
          t.userPhone.includes(q),
      )
      .sort((a, b) =>
        tab === "needs_reply" || tab === "open"
          ? PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] ||
            new Date(a.lastMessageAt).getTime() - new Date(b.lastMessageAt).getTime()
          : new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime(),
      );
  }, [tickets, tab, query, source]);

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: "needs_reply", label: "Needs reply", count: counts?.awaitingReply },
    { id: "open", label: "Open", count: counts ? counts.open + counts.inProgress : undefined },
    { id: "waiting", label: "Waiting on player", count: counts?.waiting },
    { id: "resolved", label: "Resolved", count: counts?.resolved },
    { id: "all", label: "All" },
  ];

  return (
    <AdminShell>
      <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-semibold text-foreground">Support</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Requests raised by players in the app. Oldest urgent ones first.
            </p>
          </div>
          <div className="relative w-full sm:w-72">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search #, subject, name or phone"
              className="h-9 w-full rounded-lg border border-input bg-background pl-9 pr-3 text-sm outline-none focus:border-primary"
            />
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-1.5">
          <div className="mr-2 flex overflow-hidden rounded-full border border-border text-xs font-semibold">
            {(["all", "player", "partner"] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setSource(k)}
                className={
                  "px-3 py-1.5 capitalize " +
                  (source === k ? "bg-foreground text-background" : "bg-background text-muted-foreground")
                }
              >
                {k === "all" ? "Everyone" : k + "s"}
              </button>
            ))}
          </div>
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={
                "inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors " +
                (tab === t.id
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-muted-foreground hover:text-foreground")
              }
            >
              {t.label}
              {t.count ? (
                <span
                  className={
                    "rounded-full px-1.5 text-[11px] " +
                    (tab === t.id ? "bg-primary-foreground/20" : "bg-background")
                  }
                >
                  {t.count}
                </span>
              ) : null}
            </button>
          ))}
        </div>

        <div className="mt-4">
          {error ? (
            <div className="surface-card rounded-xl p-6 text-sm text-destructive">{error}</div>
          ) : tickets === null ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : visible.length === 0 ? (
            <div className="surface-card flex flex-col items-center gap-2 rounded-xl p-10 text-center">
              <span className="icon-chip h-10 w-10 bg-secondary text-secondary-foreground">
                <Headset className="h-5 w-5" />
              </span>
              <p className="text-sm font-medium text-foreground">
                {tab === "needs_reply" ? "All caught up — nothing needs a reply." : "No tickets here."}
              </p>
            </div>
          ) : (
            <ul className="surface-card divide-y divide-border overflow-hidden rounded-xl">
              {visible.map((t) => (
                <li key={t.id}>
                  <Link
                    to="/support/$ticketId"
                    params={{ ticketId: t.id }}
                    className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-secondary/60"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-foreground">
                        <span className="text-muted-foreground">#{t.ticketNo}</span> {t.subject}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {t.source === "partner" ? `Partner · ${t.venueName ?? "Venue"} · ` : ""}
                        {t.userName}
                        {t.userPhone ? ` · ${t.userPhone}` : ""} · {CATEGORY_LABELS[t.category]} ·{" "}
                        {t.lastSenderKind === "user" ? "Player replied" : "Team replied"}{" "}
                        {timeAgo(t.lastMessageAt)}
                      </p>
                    </div>
                    <div className="hidden shrink-0 sm:block">
                      <TicketPriorityBadge priority={t.priority} />
                    </div>
                    <TicketStatusBadge status={t.status} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </AdminShell>
  );
}
