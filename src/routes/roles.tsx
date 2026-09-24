import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { AdminShell } from "@/components/admin/AdminShell";
import { RequireRole } from "@/components/admin/RequireRole";
import { Button } from "@/components/admin/Button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
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
import { useAdminAuth } from "@/lib/admin-auth";
import type { AdminRole } from "@/lib/admin-auth";
import {
  listAdminTeam,
  inviteAdmin,
  changeAdminRole,
  removeAdmin,
  type AdminTeamMember,
} from "@/lib/admin-data/admins";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function InviteDialog({
  open,
  onOpenChange,
  onInvited,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onInvited: () => void;
}) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<AdminRole>("Ops/Support");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleInvite() {
    setSaving(true);
    setError(null);
    try {
      await inviteAdmin({ name: name.trim(), phone, role });
      onOpenChange(false);
      onInvited();
      setName("");
      setPhone("");
      setRole("Ops/Support");
      toast.success(`${name.trim()} can now log in with +91 ${phone}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not invite this admin.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add an admin</DialogTitle>
          <DialogDescription>
            They'll be able to log in immediately with phone + OTP, same as you did.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <Label htmlFor="admin-name">Name</Label>
            <Input id="admin-name" className="mt-1.5" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="admin-phone">Phone number</Label>
            <Input
              id="admin-phone"
              className="mt-1.5"
              placeholder="10-digit mobile number"
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
            />
          </div>
          <div>
            <Label>Role</Label>
            <Select value={role} onValueChange={(v) => setRole(v as AdminRole)}>
              <SelectTrigger className="mt-1.5">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Ops/Support">Ops/Support</SelectItem>
                <SelectItem value="Super Admin">Super Admin</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {error && <p className="text-xs font-medium text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button
            disabled={name.trim().length < 2 || phone.length !== 10 || saving}
            onClick={handleInvite}
          >
            {saving ? "Adding\u2026" : "Add admin"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AdminRolesPageContent() {
  const { admin } = useAdminAuth();
  const [team, setTeam] = useState<AdminTeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<AdminTeamMember | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = () => listAdminTeam().then(setTeam);

  useEffect(() => {
    setLoading(true);
    refresh()
      .catch((e) => setLoadError(e instanceof Error ? e.message : "Could not load the admin team."))
      .finally(() => setLoading(false));
  }, []);

  async function handleRoleChange(member: AdminTeamMember, role: AdminRole) {
    setBusyId(member.id);
    try {
      await changeAdminRole(member.id, role);
      await refresh();
      toast.success(`${member.name} is now ${role}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not change this role.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleRemove() {
    if (!removeTarget) return;
    setBusyId(removeTarget.id);
    try {
      await removeAdmin(removeTarget.id);
      await refresh();
      toast.success(`${removeTarget.name} removed`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not remove this admin.");
    } finally {
      setBusyId(null);
      setRemoveTarget(null);
    }
  }

  return (
    <AdminShell>
      <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-semibold text-foreground sm:text-3xl">
              Admin Roles
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {loading ? "Loading\u2026" : `${team.length} admins with access`}
            </p>
          </div>
          <Button onClick={() => setInviteOpen(true)}>
            <Plus className="h-4 w-4" />
            Add admin
          </Button>
        </div>

        {loadError && <p className="mb-4 text-sm font-medium text-destructive">{loadError}</p>}

        {loading ? (
          <div className="mt-8 flex justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="surface-card overflow-hidden rounded-xl">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Name</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Added</TableHead>
                  <TableHead className="w-8" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {team.map((member) => {
                  const isSelf = member.id === admin?.id;
                  return (
                    <TableRow key={member.id}>
                      <TableCell className="font-medium text-foreground">
                        {member.name}
                        {isSelf ? <span className="ml-1.5 text-xs text-muted-foreground">(you)</span> : null}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {member.phone ?? "\u2014"}
                      </TableCell>
                      <TableCell>
                        <Select
                          value={member.role}
                          disabled={isSelf || busyId === member.id}
                          onValueChange={(v) => handleRoleChange(member, v as AdminRole)}
                        >
                          <SelectTrigger className="h-8 w-36 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Ops/Support">Ops/Support</SelectItem>
                            <SelectItem value="Super Admin">Super Admin</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
                            member.status === "active"
                              ? "bg-primary/10 text-primary"
                              : "bg-accent/15 text-accent"
                          }`}
                        >
                          {member.status === "active" ? "Active" : "Invited"}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDate(member.addedDate)}
                      </TableCell>
                      <TableCell>
                        {!isSelf && (
                          <button
                            className="text-muted-foreground hover:text-destructive disabled:opacity-40"
                            disabled={busyId === member.id}
                            onClick={() => setRemoveTarget(member)}
                            aria-label="Remove admin"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <InviteDialog open={inviteOpen} onOpenChange={setInviteOpen} onInvited={refresh} />

      <AlertDialog open={removeTarget !== null} onOpenChange={(v) => !v && setRemoveTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {removeTarget?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              They'll immediately lose admin access. This doesn't affect any other account they
              might have on the consumer or partner apps.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleRemove}>Remove</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminShell>
  );
}

export function AdminRolesPage() {
  return (
    <RequireRole path="/roles" note="Managing admin access is restricted to Super Admin.">
      <AdminRolesPageContent />
    </RequireRole>
  );
}