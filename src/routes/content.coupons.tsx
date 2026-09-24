import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { AdminShell } from "@/components/admin/AdminShell";
import { Button } from "@/components/admin/Button";
import { ContentSectionTabs } from "@/components/admin/ContentSectionTabs";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { listCoupons, createCoupon, deleteCoupon, couponStatus, type Coupon, type DiscountType } from "@/lib/admin-data/coupons";
import { listFeaturedVenues, type FeaturedVenue } from "@/lib/admin-data/content";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

const statusTone: Record<string, string> = {
  active: "bg-primary/10 text-primary",
  expired: "bg-muted text-muted-foreground",
  exhausted: "bg-destructive/10 text-destructive",
};

function CreateCouponDialog({
  open,
  onOpenChange,
  venues,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  venues: FeaturedVenue[];
  onCreated: () => void;
}) {
  const [code, setCode] = useState("");
  const [type, setType] = useState<DiscountType>("flat");
  const [value, setValue] = useState("100");
  const [usageLimit, setUsageLimit] = useState("100");
  const [expiryDate, setExpiryDate] = useState("");
  const [scope, setScope] = useState<"all" | "specific">("all");
  const [selectedVenues, setSelectedVenues] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const isValid =
    code.trim().length >= 3 &&
    Number(value) > 0 &&
    Number(usageLimit) > 0 &&
    expiryDate.length > 0 &&
    (scope === "all" || selectedVenues.length > 0);

  async function handleCreate() {
    setSaving(true);
    try {
      const coupon = await createCoupon({
        code: code.trim().toUpperCase(),
        type,
        value: Number(value),
        usageLimit: Number(usageLimit),
        expiryDate,
        applicableVenues: scope === "all" ? "all" : selectedVenues,
      });
      onOpenChange(false);
      onCreated();
      setCode("");
      setValue("100");
      setUsageLimit("100");
      setExpiryDate("");
      setScope("all");
      setSelectedVenues([]);
      toast.success(`Coupon ${coupon.code} created`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not create this coupon.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create a discount code</DialogTitle>
          <DialogDescription>Goes live immediately once created.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <Label htmlFor="coupon-code">Code</Label>
            <Input
              id="coupon-code"
              className="mt-1.5 uppercase"
              placeholder="e.g. WELCOME100"
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Discount type</Label>
              <Select value={type} onValueChange={(v) => setType(v as DiscountType)}>
                <SelectTrigger className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="flat">Flat (\u20b9)</SelectItem>
                  <SelectItem value="percentage">Percentage (%)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="coupon-value">Value</Label>
              <Input
                id="coupon-value"
                type="number"
                min={0}
                max={type === "percentage" ? 100 : undefined}
                className="mt-1.5"
                value={value}
                onChange={(e) => setValue(e.target.value)}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="coupon-limit">Usage limit</Label>
              <Input
                id="coupon-limit"
                type="number"
                min={1}
                className="mt-1.5"
                value={usageLimit}
                onChange={(e) => setUsageLimit(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="coupon-expiry">Expiry date</Label>
              <Input
                id="coupon-expiry"
                type="date"
                className="mt-1.5"
                value={expiryDate}
                onChange={(e) => setExpiryDate(e.target.value)}
              />
            </div>
          </div>
          <div>
            <Label>Applicable venues</Label>
            <Select value={scope} onValueChange={(v) => setScope(v as "all" | "specific")}>
              <SelectTrigger className="mt-1.5">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All venues</SelectItem>
                <SelectItem value="specific">Specific venues</SelectItem>
              </SelectContent>
            </Select>
            {scope === "specific" ? (
              <div className="mt-2 max-h-40 space-y-1.5 overflow-y-auto rounded-lg border border-border p-2">
                {venues.map((v) => (
                  <label key={v.id} className="flex items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-secondary">
                    <Checkbox
                      checked={selectedVenues.includes(v.id)}
                      onCheckedChange={(checked) =>
                        setSelectedVenues((prev) =>
                          checked ? [...prev, v.id] : prev.filter((id) => id !== v.id),
                        )
                      }
                    />
                    {v.name}
                  </label>
                ))}
              </div>
            ) : null}
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button disabled={!isValid || saving} onClick={handleCreate}>
            {saving ? "Creating\u2026" : "Create coupon"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function CouponsPage() {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [venues, setVenues] = useState<FeaturedVenue[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Coupon | null>(null);
  const [deleting, setDeleting] = useState(false);

  const refresh = () => listCoupons().then(setCoupons);

  useEffect(() => {
    setLoading(true);
    Promise.all([listCoupons(), listFeaturedVenues()])
      .then(([c, v]) => {
        setCoupons(c);
        setVenues(v);
      })
      .catch((e) => setLoadError(e instanceof Error ? e.message : "Could not load coupons."))
      .finally(() => setLoading(false));
  }, []);

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteCoupon(deleteTarget.id);
      await refresh();
      toast.success(`Coupon ${deleteTarget.code} deleted`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not delete this coupon.");
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  }

  return (
    <AdminShell>
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-semibold text-foreground sm:text-3xl">
              Content, Discovery &amp; Roles
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {loading ? "Loading\u2026" : `${coupons.length} discount codes`}
            </p>
          </div>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" />
            Create coupon
          </Button>
        </div>

        <ContentSectionTabs />

        {loadError && <p className="mt-4 text-sm font-medium text-destructive">{loadError}</p>}

        {loading ? (
          <div className="mt-8 flex justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="surface-card mt-4 overflow-hidden rounded-xl">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Code</TableHead>
                  <TableHead>Discount</TableHead>
                  <TableHead>Usage</TableHead>
                  <TableHead>Applicable venues</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-8" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {coupons.map((c) => {
                  const status = couponStatus(c);
                  return (
                    <TableRow key={c.id}>
                      <TableCell className="font-mono text-sm font-semibold text-foreground">
                        {c.code}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {c.type === "flat" ? `\u20b9${c.value} off` : `${c.value}% off`}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {c.usedCount} / {c.usageLimit}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {c.applicableVenues === "all" ? "All venues" : `${c.applicableVenues.length} venue(s)`}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDate(c.expiryDate)}
                      </TableCell>
                      <TableCell>
                        <span
                          className={cn(
                            "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold capitalize",
                            statusTone[status],
                          )}
                        >
                          <span className="h-1.5 w-1.5 rounded-full bg-current" />
                          {status}
                        </span>
                      </TableCell>
                      <TableCell>
                        <button
                          className="text-muted-foreground hover:text-destructive"
                          onClick={() => setDeleteTarget(c)}
                          aria-label="Delete coupon"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <CreateCouponDialog open={createOpen} onOpenChange={setCreateOpen} venues={venues} onCreated={refresh} />

      <AlertDialog open={deleteTarget !== null} onOpenChange={(v) => !v && !deleting && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete coupon {deleteTarget?.code}?</AlertDialogTitle>
            <AlertDialogDescription>
              It will stop working immediately for anyone who hasn't already applied it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deleting}>
              {deleting ? "Deleting\u2026" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminShell>
  );
}