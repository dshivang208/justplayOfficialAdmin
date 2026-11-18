import { Fragment, useEffect, useMemo, useState } from "react";
import { Loader2, Search } from "lucide-react";
import { AdminShell } from "@/components/admin/AdminShell";
import { ExportCsvButton } from "@/components/admin/ExportCsvButton";
import { listAuditLog, type AuditEntry } from "@/lib/admin-data/opsTools";

function fmt(iso: string) {
  return new Date(iso).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "2-digit", hour: "numeric", minute: "2-digit" });
}

export function AuditLogPage() {
  const [rows, setRows] = useState<AuditEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [area, setArea] = useState("all");
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    listAuditLog()
      .then(setRows)
      .catch((e) => setError(e instanceof Error ? e.message : "Couldn't load the audit log."));
  }, []);

  const areas = useMemo(() => Array.from(new Set((rows ?? []).map((r) => r.action.split(".")[0]))).sort(), [rows]);
  const visible = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (rows ?? [])
      .filter((r) => area === "all" || r.action.startsWith(area + "."))
      .filter((r) => !s || r.action.toLowerCase().includes(s) || r.adminName.toLowerCase().includes(s) || r.targetId.toLowerCase().includes(s));
  }, [rows, q, area]);

  return (
    <AdminShell>
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-semibold text-foreground sm:text-3xl">Audit Log</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Every privileged admin action — who did what, and when. Read-only.
            </p>
          </div>
          <ExportCsvButton
            filename="justplay-audit-log"
            disabled={visible.length === 0}
            headers={["Time", "Admin", "Action", "Target table", "Target ID", "Details"]}
            getRows={() => visible.map((r) => [r.createdAt, r.adminName, r.action, r.targetTable, r.targetId, JSON.stringify(r.details)])}
          />
        </div>
        <div className="mb-4 flex flex-wrap gap-2">
          <div className="relative w-full sm:w-72">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search action, admin or target ID"
              className="h-9 w-full rounded-lg border border-input bg-background pl-9 pr-3 text-sm outline-none focus:border-primary" />
          </div>
          <select value={area} onChange={(e) => setArea(e.target.value)}
            className="h-9 rounded-lg border border-input bg-background px-3 text-sm">
            <option value="all">All areas</option>
            {areas.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>

        {error ? (
          <p className="text-sm font-medium text-destructive">{error}</p>
        ) : rows === null ? (
          <div className="mt-8 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="surface-card overflow-x-auto rounded-xl">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-3">Time</th><th className="px-4 py-3">Admin</th>
                  <th className="px-4 py-3">Action</th><th className="px-4 py-3">Target</th><th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {visible.length === 0 ? (
                  <tr><td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">No entries.</td></tr>
                ) : visible.map((r) => (
                  <Fragment key={r.id}>
                    <tr className="border-b border-border/60 last:border-0">
                      <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">{fmt(r.createdAt)}</td>
                      <td className="px-4 py-3 font-medium text-foreground">{r.adminName}</td>
                      <td className="px-4 py-3"><span className="rounded-md bg-secondary px-2 py-0.5 font-mono text-xs">{r.action}</span></td>
                      <td className="px-4 py-3 text-muted-foreground"><span className="font-mono text-xs">{r.targetTable}</span> · <span className="font-mono text-xs">{r.targetId.slice(0, 8)}</span></td>
                      <td className="px-4 py-3 text-right">
                        <button type="button" onClick={() => setOpen(open === r.id ? null : r.id)} className="text-xs font-semibold text-primary hover:underline">
                          {open === r.id ? "Hide" : "Details"}
                        </button>
                      </td>
                    </tr>
                    {open === r.id ? (
                      <tr className="border-b border-border/60 bg-secondary/40">
                        <td colSpan={5} className="px-4 py-3">
                          <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all text-xs text-muted-foreground">{JSON.stringify(r.details, null, 2)}</pre>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AdminShell>
  );
}
