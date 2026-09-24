import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Loader2, RefreshCw } from "lucide-react";
import { RequireRole } from "@/components/admin/RequireRole";
import { AdminShell } from "@/components/admin/AdminShell";
import { Button } from "@/components/admin/Button";
import { PaymentSectionTabs } from "@/components/admin/PaymentSectionTabs";
import { TransactionStatusBadge, ReconciliationBadge } from "@/components/admin/StatusBadge";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  listTransactions,
  runReconciliation,
  type Transaction,
  type TransactionStatus,
  type ReconciliationStatus,
} from "@/lib/admin-data/transactions";

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

const ALL = "all";

function TransactionLogPageContent() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reconciling, setReconciling] = useState(false);

  const [status, setStatus] = useState<string>(ALL);
  const [reconciliation, setReconciliation] = useState<string>(ALL);

  const refresh = () => listTransactions().then(setTransactions);

  useEffect(() => {
    setLoading(true);
    refresh()
      .catch((e) => setLoadError(e instanceof Error ? e.message : "Could not load transactions."))
      .finally(() => setLoading(false));
  }, []);

  const mismatchCount = transactions.filter((t) => t.reconciliation === "mismatch").length;

  const filtered = useMemo(() => {
    return transactions.filter((t) => {
      if (status !== ALL && t.status !== (status as TransactionStatus)) return false;
      if (reconciliation !== ALL && t.reconciliation !== (reconciliation as ReconciliationStatus))
        return false;
      return true;
    });
  }, [transactions, status, reconciliation]);

  async function handleRunReconciliation() {
    setReconciling(true);
    try {
      const result = await runReconciliation(7);
      await refresh();
      toast.success(
        result.mismatches > 0
          ? `Checked ${result.checked} payments \u2014 ${result.mismatches} new mismatch${result.mismatches === 1 ? "" : "es"} found`
          : `Checked ${result.checked} payments \u2014 all match`,
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Reconciliation run failed.");
    } finally {
      setReconciling(false);
    }
  }

  return (
    <AdminShell>
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-semibold text-foreground sm:text-3xl">
              Payments, Payouts &amp; Refunds
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {loading ? "Loading\u2026" : `${transactions.length} transactions processed via Razorpay`}
            </p>
          </div>
          <Button variant="outline" size="sm" disabled={reconciling} onClick={handleRunReconciliation}>
            <RefreshCw className={`h-3.5 w-3.5 ${reconciling ? "animate-spin" : ""}`} />
            {reconciling ? "Running\u2026" : "Run reconciliation (last 7 days)"}
          </Button>
        </div>

        <PaymentSectionTabs />

        {loadError && <p className="mt-4 text-sm font-medium text-destructive">{loadError}</p>}

        {loading ? (
          <div className="mt-8 flex justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            {mismatchCount > 0 ? (
              <div className="mt-4 flex items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                {mismatchCount} transaction{mismatchCount === 1 ? "" : "s"}{" "}
                {mismatchCount === 1 ? "doesn't" : "don't"} match the internal booking record &mdash;
                reconciliation needed.
              </div>
            ) : null}

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger className="h-8 w-36 text-xs">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All statuses</SelectItem>
                  <SelectItem value="success">Success</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="failed">Failed</SelectItem>
                </SelectContent>
              </Select>

              <Select value={reconciliation} onValueChange={setReconciliation}>
                <SelectTrigger className="h-8 w-44 text-xs">
                  <SelectValue placeholder="Reconciliation" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All reconciliation</SelectItem>
                  <SelectItem value="matched">Matched</SelectItem>
                  <SelectItem value="mismatch">Mismatch</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                </SelectContent>
              </Select>

              {status !== ALL || reconciliation !== ALL ? (
                <button
                  type="button"
                  onClick={() => {
                    setStatus(ALL);
                    setReconciliation(ALL);
                  }}
                  className="text-xs font-semibold text-primary hover:underline"
                >
                  Clear filters
                </button>
              ) : null}

              <span className="ml-auto text-xs text-muted-foreground">
                {filtered.length} of {transactions.length} transactions
              </span>
            </div>

            <div className="surface-card mt-3 overflow-hidden rounded-xl">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Transaction</TableHead>
                    <TableHead>Booking</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Gateway status</TableHead>
                    <TableHead>Reconciliation</TableHead>
                    <TableHead>Timestamp</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((t) => (
                    <TableRow key={t.bookingId}>
                      <TableCell>
                        <span className="font-medium text-foreground">{t.id}</span>
                        <p className="text-xs text-muted-foreground">Razorpay</p>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{t.bookingId}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{t.customerName}</TableCell>
                      <TableCell className="text-sm text-foreground">
                        \u20b9{t.amount.toLocaleString("en-IN")}
                      </TableCell>
                      <TableCell>
                        <TransactionStatusBadge status={t.status} />
                      </TableCell>
                      <TableCell>
                        <ReconciliationBadge status={t.reconciliation} />
                        {t.mismatchNote ? (
                          <p className="mt-1 max-w-xs text-xs text-destructive">{t.mismatchNote}</p>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {formatDateTime(t.timestamp)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </div>
    </AdminShell>
  );
}

export function TransactionLogPage() {
  return (
    <RequireRole path="/payments" note="Transaction and reconciliation data is restricted to Super Admin.">
      <TransactionLogPageContent />
    </RequireRole>
  );
}