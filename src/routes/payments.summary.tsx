import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, RefreshCw } from "lucide-react";
import { RequireRole } from "@/components/admin/RequireRole";
import { AdminShell } from "@/components/admin/AdminShell";
import { Button } from "@/components/admin/Button";
import { PaymentSectionTabs } from "@/components/admin/PaymentSectionTabs";
import { GmvChart, CommissionPayoutsChart } from "@/components/admin/FinancialChart";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getFinancialSummary, refreshFinancialSummary, type FinancialDay } from "@/lib/admin-data/financials";

const ranges = [
  { value: "7", label: "Last 7 days" },
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" },
] as const;

function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="surface-card rounded-xl p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-2 font-display text-2xl font-semibold text-foreground">{value}</p>
      {hint ? <p className="mt-2 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function FinancialSummaryPageContent() {
  const [range, setRange] = useState<"7" | "30" | "90">("30");
  const [series, setSeries] = useState<FinancialDay[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const days = Number(range) as 7 | 30 | 90;

  useEffect(() => {
    setLoading(true);
    getFinancialSummary(days)
      .then(setSeries)
      .catch((e) => setLoadError(e instanceof Error ? e.message : "Could not load the financial summary."))
      .finally(() => setLoading(false));
  }, [days]);

  async function handleRefresh() {
    setRefreshing(true);
    try {
      await refreshFinancialSummary();
      setSeries(await getFinancialSummary(days));
      toast.success("Summary refreshed with the latest data");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not refresh the summary.");
    } finally {
      setRefreshing(false);
    }
  }

  const summary = series.reduce(
    (acc, day) => ({
      gmv: acc.gmv + day.gmv,
      commission: acc.commission + day.commission,
      payoutsMade: acc.payoutsMade + day.payoutsMade,
      refunds: acc.refunds + day.refunds,
      credits: acc.credits + day.credits,
    }),
    { gmv: 0, commission: 0, payoutsMade: 0, refunds: 0, credits: 0 },
  );
  const netRevenue = summary.commission - summary.refunds - summary.credits;
  const rangeLabel = ranges.find((r) => r.value === range)!.label.toLowerCase();

  return (
    <AdminShell>
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-semibold text-foreground sm:text-3xl">
              Payments, Payouts &amp; Refunds
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">Platform financial summary</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={refreshing} onClick={handleRefresh}>
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
              {refreshing ? "Refreshing\u2026" : "Refresh"}
            </Button>
            <Select value={range} onValueChange={(v) => setRange(v as "7" | "30" | "90")}>
              <SelectTrigger className="h-9 w-40 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ranges.map((r) => (
                  <SelectItem key={r.value} value={r.value}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <PaymentSectionTabs />

        {loadError && <p className="mt-4 text-sm font-medium text-destructive">{loadError}</p>}

        {loading ? (
          <div className="mt-8 flex justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard
                label="Platform GMV"
                value={`\u20b9${summary.gmv.toLocaleString("en-IN")}`}
                hint={`Gross booking value, ${rangeLabel}`}
              />
              <StatCard
                label="Commission earned"
                value={`\u20b9${summary.commission.toLocaleString("en-IN")}`}
                hint="Platform's cut across all venues, at each court's own rate"
              />
              <StatCard
                label="Payouts made"
                value={`\u20b9${summary.payoutsMade.toLocaleString("en-IN")}`}
                hint="Total sent to venues"
              />
              <StatCard
                label="Net platform revenue"
                value={`\u20b9${netRevenue.toLocaleString("en-IN")}`}
                hint="Commission minus refunds &amp; goodwill credits (excludes Razorpay's own processing fee, not tracked here)"
              />
            </div>

            <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
              <div className="surface-card rounded-xl p-4">
                <h2 className="font-display text-lg font-semibold text-foreground">GMV over time</h2>
                <p className="text-xs text-muted-foreground">
                  {ranges.find((r) => r.value === range)!.label}
                </p>
                <div className="mt-3">
                  <GmvChart data={series} />
                </div>
              </div>
              <div className="surface-card rounded-xl p-4">
                <h2 className="font-display text-lg font-semibold text-foreground">
                  Commission vs. payouts
                </h2>
                <p className="text-xs text-muted-foreground">
                  {ranges.find((r) => r.value === range)!.label}
                </p>
                <div className="mt-3">
                  <CommissionPayoutsChart data={series} />
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </AdminShell>
  );
}

export function FinancialSummaryPage() {
  return (
    <RequireRole path="/payments/summary" note="Financial summaries are restricted to Super Admin.">
      <FinancialSummaryPageContent />
    </RequireRole>
  );
}