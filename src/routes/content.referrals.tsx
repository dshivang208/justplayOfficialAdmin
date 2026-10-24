import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Gift, Loader2, Save } from "lucide-react";
import { AdminShell } from "@/components/admin/AdminShell";
import { Button } from "@/components/admin/Button";
import { ContentSectionTabs } from "@/components/admin/ContentSectionTabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAdminAuth } from "@/lib/admin-auth";
import { cn } from "@/lib/utils";
import {
  adjustPoints,
  getReferralOverview,
  getReferralSettings,
  listReferrals,
  referralErrorMessage,
  saveReferralSettings,
  type ReferralOverview,
  type ReferralRow,
  type ReferralSettings,
} from "@/lib/admin-data/referrals";

function fmtDate(iso: string | null) {
  return iso
    ? new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
    : "—";
}
const n = (v: number) => v.toLocaleString("en-IN");

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="surface-card rounded-xl p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 font-display text-2xl font-semibold text-foreground">{value}</p>
      {hint ? <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <Label>{label}</Label>
      <div className="mt-1.5">{children}</div>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

const statusTone: Record<string, string> = {
  joined: "bg-accent/15 text-accent",
  invited: "bg-muted text-muted-foreground",
  first_booking_complete: "bg-primary/10 text-primary",
};
const statusLabel: Record<string, string> = {
  joined: "Awaiting reward",
  invited: "Invited",
  first_booking_complete: "Rewarded",
};

export function ReferralsPage() {
  const { admin } = useAdminAuth();
  const canEdit = admin?.role === "Super Admin";

  const [settings, setSettings] = useState<ReferralSettings | null>(null);
  const [draft, setDraft] = useState<ReferralSettings | null>(null);
  const [overview, setOverview] = useState<ReferralOverview | null>(null);
  const [rows, setRows] = useState<ReferralRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [adjPhone, setAdjPhone] = useState("");
  const [adjPoints, setAdjPoints] = useState("");
  const [adjReason, setAdjReason] = useState("");
  const [adjusting, setAdjusting] = useState(false);

  const loadAll = async () => {
    const [s, o, r] = await Promise.all([getReferralSettings(), getReferralOverview(), listReferrals(100)]);
    setSettings(s);
    setDraft(s);
    setOverview(o);
    setRows(r);
  };

  useEffect(() => {
    loadAll()
      .catch((e) => setLoadError(referralErrorMessage(e instanceof Error ? e.message : "Could not load.")))
      .finally(() => setLoading(false));
  }, []);

  const dirty = useMemo(
    () => (settings && draft ? JSON.stringify({ ...settings, updatedAt: 0 }) !== JSON.stringify({ ...draft, updatedAt: 0 }) : false),
    [settings, draft],
  );

  const set = <K extends keyof ReferralSettings>(k: K, v: ReferralSettings[K]) =>
    setDraft((d) => (d ? { ...d, [k]: v } : d));
  const num = (k: keyof ReferralSettings) => (e: React.ChangeEvent<HTMLInputElement>) =>
    set(k, (e.target.value === "" ? 0 : Number(e.target.value)) as never);

  async function handleSave() {
    if (!draft) return;
    setSaving(true);
    try {
      const saved = await saveReferralSettings(draft);
      setSettings(saved);
      setDraft(saved);
      toast.success("Referral settings saved — live for players now.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setSaving(false);
    }
  }

  async function handleAdjust() {
    const pts = Number(adjPoints);
    setAdjusting(true);
    try {
      const res = await adjustPoints(adjPhone, pts, adjReason);
      toast.success(`${res.name || "Player"} now has ${n(res.newBalance)} points.`);
      setAdjPhone("");
      setAdjPoints("");
      setAdjReason("");
      setOverview(await getReferralOverview());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not adjust points.");
    } finally {
      setAdjusting(false);
    }
  }

  const ex = draft
    ? {
        worth: Math.floor(draft.referrerPoints * draft.pointValueInr),
        cap: Math.floor((1000 * draft.maxRedeemPercent) / 100),
      }
    : null;

  return (
    <AdminShell>
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-4">
          <h1 className="font-display text-2xl font-semibold text-foreground sm:text-3xl">
            Content, Discovery &amp; Roles
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Referral &amp; reward points — control how players earn and spend points.
          </p>
        </div>

        <ContentSectionTabs />

        {loadError ? <p className="mt-4 text-sm font-medium text-destructive">{loadError}</p> : null}

        {loading ? (
          <div className="mt-8 flex justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : draft && overview ? (
          <>
            {!canEdit ? (
              <p className="mt-4 rounded-lg border border-border bg-secondary/60 px-3 py-2 text-sm text-muted-foreground">
                You can view the program, but only a Super Admin can change settings or adjust points.
              </p>
            ) : null}

            {/* Stats */}
            <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
              <Stat label="Referrals" value={n(overview.totalReferrals)} hint={`${n(overview.pending)} awaiting reward`} />
              <Stat label="Rewarded" value={n(overview.rewarded)} />
              <Stat label="Points issued" value={n(overview.pointsIssued)} />
              <Stat label="Points redeemed" value={n(overview.pointsRedeemed)} />
              <Stat
                label="Outstanding"
                value={n(overview.pointsOutstanding)}
                hint={`≈ ₹${n(Math.floor(overview.pointsOutstanding * draft.pointValueInr))} liability`}
              />
            </div>

            {/* Settings */}
            <div className="surface-card mt-4 rounded-xl p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
                  <Gift className="h-4.5 w-4.5 text-primary" /> Program settings
                </h2>
                {canEdit ? (
                  <Button onClick={handleSave} disabled={!dirty || saving}>
                    <Save className="h-4 w-4" />
                    {saving ? "Saving…" : "Save changes"}
                  </Button>
                ) : null}
              </div>

              <fieldset disabled={!canEdit} className="mt-5 space-y-6">
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="flex items-start justify-between gap-4 rounded-lg border border-border p-3.5">
                    <span>
                      <span className="block text-sm font-semibold">Referral program</span>
                      <span className="block text-xs text-muted-foreground">
                        Off hides the invite section and stops new referrals and rewards.
                      </span>
                    </span>
                    <Switch checked={draft.programEnabled} onCheckedChange={(v) => set("programEnabled", v)} />
                  </label>
                  <label className="flex items-start justify-between gap-4 rounded-lg border border-border p-3.5">
                    <span>
                      <span className="block text-sm font-semibold">Redeem points on bookings</span>
                      <span className="block text-xs text-muted-foreground">
                        Off stops players spending points at checkout (balances are kept).
                      </span>
                    </span>
                    <Switch checked={draft.redemptionEnabled} onCheckedChange={(v) => set("redemptionEnabled", v)} />
                  </label>
                </div>

                <div>
                  <p className="mb-3 text-xs font-bold uppercase tracking-wide text-muted-foreground">Earning</p>
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <Field label="Points for the referrer" hint="Given to the player who shared their code.">
                      <Input type="number" min={0} value={draft.referrerPoints} onChange={num("referrerPoints")} />
                    </Field>
                    <Field label="Points for the new player" hint="Given to the friend who joined with the code.">
                      <Input type="number" min={0} value={draft.refereePoints} onChange={num("refereePoints")} />
                    </Field>
                    <Field label="Reward is given" hint="When the new player qualifies.">
                      <Select value={draft.rewardTrigger} onValueChange={(v) => set("rewardTrigger", v as ReferralSettings["rewardTrigger"])}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="first_booking">After their first paid booking</SelectItem>
                          <SelectItem value="signup">Immediately on signup</SelectItem>
                        </SelectContent>
                      </Select>
                    </Field>
                    <Field label="Minimum first booking (₹)" hint="Only for “first booking”. 0 = any amount.">
                      <Input type="number" min={0} value={draft.minBookingAmount} onChange={num("minBookingAmount")} />
                    </Field>
                    <Field label="Max rewards per referrer" hint="0 = unlimited. Extra referrals still reward the new player.">
                      <Input type="number" min={0} value={draft.maxRewardsPerReferrer} onChange={num("maxRewardsPerReferrer")} />
                    </Field>
                    <Field label="Code valid for (days after signup)" hint="Older accounts can't claim a code.">
                      <Input type="number" min={0} max={365} value={draft.codeWindowDays} onChange={num("codeWindowDays")} />
                    </Field>
                  </div>
                </div>

                <div>
                  <p className="mb-3 text-xs font-bold uppercase tracking-wide text-muted-foreground">Spending</p>
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <Field label="1 point is worth (₹)" hint="e.g. 1 = ₹1, 0.5 = ₹0.50 per point.">
                      <Input type="number" min={0.01} step={0.01} value={draft.pointValueInr} onChange={num("pointValueInr")} />
                    </Field>
                    <Field label="Max % of a booking payable with points" hint="1–100.">
                      <Input type="number" min={1} max={100} value={draft.maxRedeemPercent} onChange={num("maxRedeemPercent")} />
                    </Field>
                    <Field label="Minimum points to redeem" hint="Players below this can't use points.">
                      <Input type="number" min={0} value={draft.minRedeemPoints} onChange={num("minRedeemPoints")} />
                    </Field>
                  </div>
                </div>
              </fieldset>

              {ex ? (
                <p className="mt-5 rounded-lg bg-primary/5 px-3 py-2.5 text-sm text-foreground">
                  <strong>Preview:</strong> a referrer earns {n(draft.referrerPoints)} points (≈ ₹{n(ex.worth)}), the
                  new player earns {n(draft.refereePoints)}. On a ₹1,000 booking a player can use points worth up to ₹
                  {n(ex.cap)}.
                </p>
              ) : null}
            </div>

            {/* Adjust points */}
            {canEdit ? (
              <div className="surface-card mt-4 rounded-xl p-5">
                <h2 className="font-display text-lg font-semibold">Adjust a player's points</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Goodwill or corrections. Use a negative number to deduct. The player is notified.
                </p>
                <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_8rem_2fr_auto] sm:items-end">
                  <Field label="Player phone">
                    <Input value={adjPhone} onChange={(e) => setAdjPhone(e.target.value)} placeholder="10-digit mobile" />
                  </Field>
                  <Field label="Points">
                    <Input type="number" value={adjPoints} onChange={(e) => setAdjPoints(e.target.value)} placeholder="+50 / -50" />
                  </Field>
                  <Field label="Reason">
                    <Input value={adjReason} onChange={(e) => setAdjReason(e.target.value)} placeholder="e.g. Compensation for cancelled slot" />
                  </Field>
                  <Button
                    onClick={handleAdjust}
                    disabled={adjusting || adjPhone.replace(/\D/g, "").length < 10 || !Number(adjPoints) || adjReason.trim().length < 3}
                  >
                    {adjusting ? "Applying…" : "Apply"}
                  </Button>
                </div>
              </div>
            ) : null}

            {/* Top referrers */}
            {overview.topReferrers.length > 0 ? (
              <div className="surface-card mt-4 overflow-hidden rounded-xl">
                <div className="border-b border-border px-4 py-3 font-display text-base font-semibold">Top referrers</div>
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead>Player</TableHead>
                      <TableHead>Code</TableHead>
                      <TableHead className="text-right">Joined</TableHead>
                      <TableHead className="text-right">Rewarded</TableHead>
                      <TableHead className="text-right">Points earned</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {overview.topReferrers.map((t) => (
                      <TableRow key={t.code}>
                        <TableCell>
                          <p className="font-medium">{t.name || "—"}</p>
                          <p className="text-xs text-muted-foreground">{t.phone}</p>
                        </TableCell>
                        <TableCell className="font-mono text-xs">{t.code}</TableCell>
                        <TableCell className="text-right">{t.invited}</TableCell>
                        <TableCell className="text-right">{t.rewarded}</TableCell>
                        <TableCell className="text-right font-semibold">{n(t.points)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : null}

            {/* Referral log */}
            <div className="surface-card mt-4 overflow-hidden rounded-xl">
              <div className="border-b border-border px-4 py-3 font-display text-base font-semibold">
                Recent referrals
              </div>
              {rows.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-muted-foreground">No referrals yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead>Referrer</TableHead>
                        <TableHead>New player</TableHead>
                        <TableHead>Code</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Points (ref / new)</TableHead>
                        <TableHead>Date</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.map((r) => (
                        <TableRow key={r.id}>
                          <TableCell>
                            <p className="font-medium">{r.referrerName || "—"}</p>
                            <p className="text-xs text-muted-foreground">{r.referrerPhone}</p>
                          </TableCell>
                          <TableCell>
                            <p className="font-medium">{r.refereeName || "—"}</p>
                            <p className="text-xs text-muted-foreground">{r.refereePhone ?? ""}</p>
                          </TableCell>
                          <TableCell className="font-mono text-xs">{r.code ?? "—"}</TableCell>
                          <TableCell>
                            <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", statusTone[r.status])}>
                              {statusLabel[r.status] ?? r.status}
                            </span>
                          </TableCell>
                          <TableCell className="text-right">
                            {r.status === "first_booking_complete" ? `${r.referrerPoints} / ${r.refereePoints}` : "—"}
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-muted-foreground">
                            {fmtDate(r.rewardedAt ?? r.createdAt)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          </>
        ) : null}
      </div>
    </AdminShell>
  );
}
