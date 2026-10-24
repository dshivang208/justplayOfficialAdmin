import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "@tanstack/react-router";
import { toast } from "sonner";
import { ArrowLeft, CheckCircle2, Loader2, Lock, Send, UserCheck } from "lucide-react";
import { AdminShell } from "@/components/admin/AdminShell";
import { Button } from "@/components/admin/Button";
import { TicketPriorityBadge, TicketStatusBadge } from "@/components/admin/StatusBadge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAdminAuth } from "@/lib/admin-auth";
import { listAdminNames } from "@/lib/admin-data/admins";
import { supabase } from "@/lib/supabaseClient";
import {
  CATEGORY_LABELS,
  PRIORITY_LABELS,
  STATUS_LABELS,
  getTicket,
  replyToTicket,
  updateTicket,
  type SupportMessage,
  type SupportTicket,
  type TicketPriority,
  type TicketStatus,
} from "@/lib/admin-data/support";

function dayLabel(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export function SupportTicketPage() {
  const { ticketId } = useParams({ from: "/support/$ticketId" });
  const { admin } = useAdminAuth();
  const [ticket, setTicket] = useState<SupportTicket | null | undefined>(undefined);
  // Ownership only matters when more than one person works the inbox, so the
  // Owner block stays hidden for a solo admin (or if the team can't be read).
  const [team, setTeam] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => {
    listAdminNames()
      .then(setTeam)
      .catch(() => setTeam([]));
  }, []);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [internal, setInternal] = useState(false);
  const [busy, setBusy] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await getTicket(ticketId);
      setTicket(res?.ticket ?? null);
      setMessages(res?.messages ?? []);
      setLoadError(null);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Couldn't load this ticket.");
    }
  }, [ticketId]);

  useEffect(() => {
    void load();
    const channel = supabase
      .channel(`admin-support-${ticketId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "support_ticket_messages", filter: `ticket_id=eq.${ticketId}` },
        () => void load(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [ticketId, load]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages.length]);

  if (loadError) {
    return (
      <AdminShell>
        <div className="mx-auto max-w-2xl px-4 py-16 text-center text-sm text-destructive">{loadError}</div>
      </AdminShell>
    );
  }
  if (ticket === undefined) {
    return (
      <AdminShell>
        <div className="flex min-h-[50vh] items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </AdminShell>
    );
  }
  if (!ticket) {
    return (
      <AdminShell>
        <div className="mx-auto max-w-2xl px-4 py-16 text-center">
          <h1 className="font-display text-2xl font-semibold text-foreground">Ticket not found</h1>
          <Link to="/support" className="mt-4 inline-block text-sm font-semibold text-primary">
            ← Back to support
          </Link>
        </div>
      </AdminShell>
    );
  }

  const t = ticket;
  const mine = admin?.id != null && t.assignedAdminId === admin.id;
  const hasTeam = team.length > 1;
  const owner = team.find((m) => m.id === t.assignedAdminId);

  async function run(fn: () => Promise<void>, ok?: string) {
    setBusy(true);
    try {
      await fn();
      await load();
      if (ok) toast.success(ok);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  async function send(status?: TicketStatus) {
    const text = draft.trim();
    if (!text) return;
    await run(async () => {
      await replyToTicket(t.id, text, { internal, status: internal ? null : (status ?? null) });
      setDraft("");
    }, internal ? "Internal note saved" : "Reply sent to the player");
  }

  return (
    <AdminShell>
      <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
        <Link
          to="/support"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> All tickets
        </Link>

        <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="font-display text-xl font-semibold text-foreground sm:text-2xl">
              <span className="text-muted-foreground">#{t.ticketNo}</span> {t.subject}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {t.source === "partner" ? (
                <>
                  <span className="mr-1.5 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold uppercase text-primary">
                    Partner
                  </span>
                  {t.venueId ? (
                    <Link to="/venues/$venueId" params={{ venueId: t.venueId }} className="font-semibold text-primary hover:underline">
                      {t.venueName ?? "Venue"}
                    </Link>
                  ) : null}
                  {" · "}
                  {t.userName}
                </>
              ) : t.userId ? (
                <Link to="/users/$userId" params={{ userId: t.userId }} className="font-semibold text-primary hover:underline">
                  {t.userName}
                </Link>
              ) : (
                t.userName
              )}
              {t.userPhone ? ` · ${t.userPhone}` : ""} · {CATEGORY_LABELS[t.category]} · opened{" "}
              {dayLabel(t.createdAt)}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <TicketPriorityBadge priority={t.priority} />
            <TicketStatusBadge status={t.status} />
          </div>
        </div>

        <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_280px]">
          {/* Conversation */}
          <div className="surface-card flex h-[34rem] flex-col overflow-hidden rounded-xl">
            <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto p-4">
              {messages.map((m, i) => {
                const fromAdmin = m.senderKind === "admin";
                const showDay = i === 0 || dayLabel(messages[i - 1]!.createdAt) !== dayLabel(m.createdAt);
                return (
                  <div key={m.id} className="space-y-3">
                    {showDay ? (
                      <div className="flex justify-center">
                        <span className="rounded-full bg-secondary px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                          {dayLabel(m.createdAt)}
                        </span>
                      </div>
                    ) : null}
                    <div className={`flex flex-col ${fromAdmin ? "items-end" : "items-start"}`}>
                      <span className="mb-0.5 flex items-center gap-1 text-[11px] font-semibold text-muted-foreground">
                        {m.internal ? <Lock className="h-3 w-3" /> : null}
                        {fromAdmin ? (m.internal ? "Internal note" : "Support team") : t.source === "partner" ? `${t.venueName ?? "Venue"} (partner)` : t.userName}
                      </span>
                      <div
                        className={`max-w-[85%] whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 text-sm ${
                          m.internal
                            ? "border border-dashed border-warning bg-warning/10 text-foreground"
                            : fromAdmin
                              ? "rounded-tr-sm bg-primary text-primary-foreground"
                              : "rounded-tl-sm bg-secondary text-foreground"
                        }`}
                      >
                        {m.body}
                      </div>
                      <span className="mt-0.5 text-[10px] text-muted-foreground">
                        {new Date(m.createdAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="border-t border-border p-3">
              <div className="mb-2 flex gap-1.5">
                <button
                  type="button"
                  onClick={() => setInternal(false)}
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${
                    !internal ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"
                  }`}
                >
                  Reply to player
                </button>
                <button
                  type="button"
                  onClick={() => setInternal(true)}
                  className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold ${
                    internal ? "bg-warning/30 text-foreground" : "bg-secondary text-muted-foreground"
                  }`}
                >
                  <Lock className="h-3 w-3" /> Internal note
                </button>
              </div>
              <textarea
                value={draft}
                rows={3}
                maxLength={2000}
                onChange={(e) => setDraft(e.target.value)}
                placeholder={internal ? "Only your team can see this…" : "Write your reply — the player is notified…"}
                className="w-full resize-none rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
              />
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                <span className="text-[11px] text-muted-foreground">{draft.length}/2000</span>
                <div className="flex gap-2">
                  {!internal ? (
                    <Button variant="outline" size="sm" disabled={!draft.trim() || busy} onClick={() => void send("resolved")}>
                      <CheckCircle2 className="h-4 w-4" /> Send & resolve
                    </Button>
                  ) : null}
                  <Button size="sm" disabled={!draft.trim() || busy} onClick={() => void send()}>
                    <Send className="h-4 w-4" /> {internal ? "Save note" : "Send reply"}
                  </Button>
                </div>
              </div>
            </div>
          </div>

          {/* Controls */}
          <aside className="space-y-4">
            <div className="surface-card space-y-3 rounded-xl p-4">
              <div>
                <p className="mb-1.5 text-xs font-semibold text-muted-foreground">Status</p>
                <Select
                  value={t.status}
                  onValueChange={(v) => void run(() => updateTicket(t.id, { status: v as TicketStatus }), "Status updated")}
                  disabled={busy}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(STATUS_LABELS) as TicketStatus[]).map((s) => (
                      <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <p className="mb-1.5 text-xs font-semibold text-muted-foreground">Priority</p>
                <Select
                  value={t.priority}
                  onValueChange={(v) => void run(() => updateTicket(t.id, { priority: v as TicketPriority }), "Priority updated")}
                  disabled={busy}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(PRIORITY_LABELS) as TicketPriority[]).map((p) => (
                      <SelectItem key={p} value={p}>{PRIORITY_LABELS[p]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {hasTeam ? (
                <div>
                  <p className="mb-1.5 text-xs font-semibold text-muted-foreground">Owner</p>
                  {mine ? (
                    <Button variant="outline" size="sm" className="w-full" disabled={busy}
                      onClick={() => void run(() => updateTicket(t.id, { assign: false }), "Unassigned")}>
                      <UserCheck className="h-4 w-4" /> Assigned to you · Unassign
                    </Button>
                  ) : (
                    <>
                      {t.assignedAdminId ? (
                        <p className="mb-1.5 text-sm font-medium text-foreground">
                          {owner ? owner.name : "A teammate"} is handling this
                        </p>
                      ) : (
                        <p className="mb-1.5 text-sm text-muted-foreground">Unassigned — nobody owns this yet</p>
                      )}
                      <Button variant="outline" size="sm" className="w-full" disabled={busy}
                        onClick={() => void run(() => updateTicket(t.id, { assign: true }), "Assigned to you")}>
                        {t.assignedAdminId ? "Take over" : "Assign to me"}
                      </Button>
                    </>
                  )}
                </div>
              ) : null}
            </div>

            <div className="surface-card space-y-2 rounded-xl p-4 text-sm">
              <p className="text-xs font-semibold text-muted-foreground">Context</p>
              {t.source === "partner" && t.venueId ? (
                <Link to="/venues/$venueId" params={{ venueId: t.venueId }} className="block font-semibold text-primary hover:underline">
                  View {t.venueName ?? "venue"}
                </Link>
              ) : t.userId ? (
                <Link to="/users/$userId" params={{ userId: t.userId }} className="block font-semibold text-primary hover:underline">
                  View {t.userName}'s profile
                </Link>
              ) : null}
              {t.bookingId ? (
                <Link to="/bookings/$bookingId" params={{ bookingId: t.bookingId }} className="block font-semibold text-primary hover:underline">
                  View linked booking
                </Link>
              ) : (
                <p className="text-xs text-muted-foreground">Not linked to a booking.</p>
              )}
            </div>
          </aside>
        </div>
      </div>
    </AdminShell>
  );
}
