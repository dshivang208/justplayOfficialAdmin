import { useCallback, useEffect, useMemo, useState } from "react";
import { Lightbulb, Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import { AdminShell } from "@/components/admin/AdminShell";
import { supabase } from "@/lib/supabaseClient";
import {
  SUGGESTION_CATEGORY_LABELS,
  SUGGESTION_STATUS_LABELS,
  listSuggestions,
  updateSuggestion,
  type Suggestion,
  type SuggestionStatus,
} from "@/lib/admin-data/suggestions";

type Tab = "new" | "reviewed" | "planned" | "done" | "dismissed" | "all";

const STATUS_STYLE: Record<SuggestionStatus, string> = {
  new: "bg-primary/15 text-primary",
  reviewed: "bg-secondary text-secondary-foreground",
  planned: "bg-amber-500/15 text-amber-700",
  done: "bg-emerald-500/15 text-emerald-700",
  dismissed: "bg-muted text-muted-foreground",
};

function fmt(iso: string) {
  return new Date(iso).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

function SuggestionItem({ s, onChanged }: { s: Suggestion; onChanged: () => void }) {
  const [note, setNote] = useState(s.adminNote ?? "");
  const [saving, setSaving] = useState(false);

  const setStatus = async (status: SuggestionStatus) => {
    setSaving(true);
    try {
      await updateSuggestion(s.id, { status });
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't update.");
    } finally {
      setSaving(false);
    }
  };

  const saveNote = async () => {
    if ((s.adminNote ?? "") === note.trim()) return;
    try {
      await updateSuggestion(s.id, { adminNote: note.trim() || null });
      toast.success("Note saved");
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save note.");
    }
  };

  return (
    <li className="surface-card rounded-xl p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${STATUS_STYLE[s.status]}`}
        >
          {SUGGESTION_STATUS_LABELS[s.status]}
        </span>
        <span className="rounded-full border border-border px-2.5 py-0.5 text-[11px] font-semibold text-muted-foreground">
          {SUGGESTION_CATEGORY_LABELS[s.category]}
        </span>
        <span className="ml-auto text-xs text-muted-foreground">{fmt(s.createdAt)}</span>
      </div>
      <p className="mt-3 whitespace-pre-wrap break-words text-sm text-foreground">{s.message}</p>
      <p className="mt-2 text-xs text-muted-foreground">
        {s.name}
        {s.email ? ` · ${s.email}` : ""} · {s.userId ? "Signed-in player" : "Visitor"}
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <select
          value={s.status}
          disabled={saving}
          onChange={(e) => void setStatus(e.target.value as SuggestionStatus)}
          className="h-8 rounded-lg border border-input bg-background px-2 text-xs font-semibold"
        >
          {(Object.keys(SUGGESTION_STATUS_LABELS) as SuggestionStatus[]).map((k) => (
            <option key={k} value={k}>
              {SUGGESTION_STATUS_LABELS[k]}
            </option>
          ))}
        </select>
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onBlur={() => void saveNote()}
          placeholder="Internal note (saved when you click away)"
          className="h-8 min-w-0 flex-1 rounded-lg border border-input bg-background px-3 text-xs outline-none focus:border-primary"
        />
      </div>
    </li>
  );
}

export function SuggestionsPage() {
  const [items, setItems] = useState<Suggestion[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("new");
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    try {
      setItems(await listSuggestions());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load suggestions.");
    }
  }, []);

  useEffect(() => {
    void load();
    const ch = supabase
      .channel("admin-suggestions")
      .on("postgres_changes", { event: "*", schema: "public", table: "suggestions" }, () => void load())
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [load]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const s of items ?? []) c[s.status] = (c[s.status] ?? 0) + 1;
    return c;
  }, [items]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (items ?? [])
      .filter((s) => tab === "all" || s.status === tab)
      .filter(
        (s) =>
          !q ||
          s.message.toLowerCase().includes(q) ||
          s.name.toLowerCase().includes(q) ||
          (s.email ?? "").toLowerCase().includes(q),
      );
  }, [items, tab, query]);

  const tabs: { id: Tab; label: string }[] = [
    { id: "new", label: "New" },
    { id: "reviewed", label: "Reviewed" },
    { id: "planned", label: "Planned" },
    { id: "done", label: "Done" },
    { id: "dismissed", label: "Dismissed" },
    { id: "all", label: "All" },
  ];

  return (
    <AdminShell>
      <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-semibold text-foreground">Suggestions</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Ideas sent by players and visitors from the app.
            </p>
          </div>
          <div className="relative w-full sm:w-72">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search text, name or email"
              className="h-9 w-full rounded-lg border border-input bg-background pl-9 pr-3 text-sm outline-none focus:border-primary"
            />
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-1.5">
          {tabs.map((t) => {
            const n = t.id === "all" ? items?.length : counts[t.id];
            return (
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
                {n ? (
                  <span
                    className={
                      "rounded-full px-1.5 text-[11px] " +
                      (tab === t.id ? "bg-primary-foreground/20" : "bg-background")
                    }
                  >
                    {n}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>

        <div className="mt-4">
          {error ? (
            <div className="surface-card rounded-xl p-6 text-sm text-destructive">{error}</div>
          ) : items === null ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : visible.length === 0 ? (
            <div className="surface-card flex flex-col items-center gap-2 rounded-xl p-10 text-center">
              <span className="icon-chip h-10 w-10 bg-secondary text-secondary-foreground">
                <Lightbulb className="h-5 w-5" />
              </span>
              <p className="text-sm font-medium text-foreground">No suggestions here.</p>
            </div>
          ) : (
            <ul className="space-y-3">
              {visible.map((s) => (
                <SuggestionItem key={s.id} s={s} onChanged={() => void load()} />
              ))}
            </ul>
          )}
        </div>
      </div>
    </AdminShell>
  );
}
