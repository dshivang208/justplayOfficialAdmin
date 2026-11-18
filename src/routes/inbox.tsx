import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Mail, Search } from "lucide-react";
import { toast } from "sonner";
import { AdminShell } from "@/components/admin/AdminShell";
import { ExportCsvButton } from "@/components/admin/ExportCsvButton";
import {
  listContactMessages,
  updateContactMessage,
  type ContactMessage,
  type ContactStatus,
} from "@/lib/admin-data/opsTools";

const LABEL: Record<ContactStatus, string> = { new: "New", in_progress: "In progress", resolved: "Resolved" };
const STYLE: Record<ContactStatus, string> = {
  new: "bg-primary/15 text-primary",
  in_progress: "bg-amber-500/15 text-amber-700",
  resolved: "bg-emerald-500/15 text-emerald-700",
};

function fmt(iso: string) {
  return new Date(iso).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "numeric", minute: "2-digit" });
}

function Item({ m, onChanged }: { m: ContactMessage; onChanged: () => void }) {
  const [note, setNote] = useState(m.adminNote ?? "");
  const [busy, setBusy] = useState(false);
  const save = async (status: ContactStatus) => {
    setBusy(true);
    try {
      await updateContactMessage(m.id, status, note);
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't update.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <li className="surface-card rounded-xl p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${STYLE[m.status]}`}>{LABEL[m.status]}</span>
        <span className="text-xs text-muted-foreground">{m.userId ? "Signed-in player" : "Visitor"}</span>
        <span className="ml-auto text-xs text-muted-foreground">{fmt(m.createdAt)}</span>
      </div>
      <p className="mt-3 whitespace-pre-wrap break-words text-sm text-foreground">{m.message}</p>
      <p className="mt-2 text-xs text-muted-foreground">
        {m.name} ·{" "}
        <a className="text-primary hover:underline" href={`mailto:${m.email}?subject=Re: your message to JustPlay`}>
          {m.email}
        </a>
      </p>
      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Internal note"
        className="mt-3 h-8 w-full rounded-lg border border-input bg-background px-3 text-xs outline-none focus:border-primary"
      />
      <div className="mt-2 flex flex-wrap gap-2">
        {(["new", "in_progress", "resolved"] as ContactStatus[]).map((s) => (
          <button
            key={s}
            type="button"
            disabled={busy}
            onClick={() => void save(s)}
            className={
              "rounded-full border px-3 py-1 text-xs font-semibold transition-colors " +
              (m.status === s
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border text-muted-foreground hover:border-primary hover:text-primary")
            }
          >
            {s === "resolved" ? "Mark resolved" : s === "in_progress" ? "In progress" : "Reopen"}
          </button>
        ))}
      </div>
    </li>
  );
}

export function ContactInboxPage() {
  const [items, setItems] = useState<ContactMessage[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<ContactStatus | "all">("new");
  const [q, setQ] = useState("");

  const load = useCallback(async () => {
    try {
      setItems(await listContactMessages());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load messages.");
    }
  }, []);
  useEffect(() => void load(), [load]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const m of items ?? []) c[m.status] = (c[m.status] ?? 0) + 1;
    return c;
  }, [items]);

  const visible = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (items ?? [])
      .filter((m) => tab === "all" || m.status === tab)
      .filter((m) => !s || m.message.toLowerCase().includes(s) || m.name.toLowerCase().includes(s) || m.email.toLowerCase().includes(s));
  }, [items, tab, q]);

  const tabs: { id: ContactStatus | "all"; label: string }[] = [
    { id: "new", label: "New" },
    { id: "in_progress", label: "In progress" },
    { id: "resolved", label: "Resolved" },
    { id: "all", label: "All" },
  ];

  return (
    <AdminShell>
      <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-semibold text-foreground">Contact Inbox</h1>
            <p className="mt-1 text-sm text-muted-foreground">Messages sent from the Contact Us page.</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative w-56">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search"
                className="h-9 w-full rounded-lg border border-input bg-background pl-9 pr-3 text-sm outline-none focus:border-primary" />
            </div>
            <ExportCsvButton
              filename="justplay-contact-messages"
              disabled={!items?.length}
              headers={["Date", "Name", "Email", "Message", "Status", "Note"]}
              getRows={() => (items ?? []).map((m) => [m.createdAt, m.name, m.email, m.message, m.status, m.adminNote ?? ""])}
            />
          </div>
        </div>
        <div className="mt-5 flex flex-wrap gap-1.5">
          {tabs.map((t) => {
            const n = t.id === "all" ? items?.length : counts[t.id];
            return (
              <button key={t.id} type="button" onClick={() => setTab(t.id)}
                className={"inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors " +
                  (tab === t.id ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground")}>
                {t.label}
                {n ? <span className={"rounded-full px-1.5 text-[11px] " + (tab === t.id ? "bg-primary-foreground/20" : "bg-background")}>{n}</span> : null}
              </button>
            );
          })}
        </div>
        <div className="mt-4">
          {error ? (
            <div className="surface-card rounded-xl p-6 text-sm text-destructive">{error}</div>
          ) : items === null ? (
            <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : visible.length === 0 ? (
            <div className="surface-card flex flex-col items-center gap-2 rounded-xl p-10 text-center">
              <Mail className="h-5 w-5 text-muted-foreground" />
              <p className="text-sm font-medium text-foreground">No messages here.</p>
            </div>
          ) : (
            <ul className="space-y-3">{visible.map((m) => <Item key={m.id} m={m} onChanged={() => void load()} />)}</ul>
          )}
        </div>
      </div>
    </AdminShell>
  );
}
