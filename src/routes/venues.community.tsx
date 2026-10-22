import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { MessagesSquare, Search, Users } from "lucide-react";
import { AdminShell } from "@/components/admin/AdminShell";
import { VenueSectionTabs } from "@/components/admin/VenueSectionTabs";
import { Button } from "@/components/admin/Button";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  listVenueGroupAccess,
  setVenueGroupAccess,
  type VenueGroupAccessRow,
} from "@/lib/admin-data/venueGroups";

type Filter = "all" | "enabled" | "disabled";

function GroupStatus({ row }: { row: VenueGroupAccessRow }) {
  if (!row.hasGroup)
    return (
      <span className="text-xs italic text-muted-foreground">Not created</span>
    );
  const live = row.enabled && row.groupActive;
  return (
    <div className="min-w-0">
      <p className="truncate text-sm font-medium text-foreground">
        {row.groupName}
      </p>
      <p className="text-xs text-muted-foreground">
        {live
          ? "Live on the venue page"
          : !row.enabled
            ? "Hidden — access is off"
            : "Paused by the owner"}
      </p>
    </div>
  );
}

export function VenueCommunityGroupsPage() {
  const [rows, setRows] = useState<VenueGroupAccessRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmOff, setConfirmOff] = useState<VenueGroupAccessRow | null>(
    null,
  );

  const load = useCallback(async () => {
    try {
      setRows(await listVenueGroupAccess());
      setLoadError(null);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Couldn't load venues.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function apply(row: VenueGroupAccessRow, enabled: boolean) {
    setBusyId(row.venueId);
    // Optimistic: flip the switch immediately, roll back on failure.
    setRows(
      (prev) =>
        prev?.map((r) => (r.venueId === row.venueId ? { ...r, enabled } : r)) ??
        prev,
    );
    try {
      await setVenueGroupAccess(row.venueId, enabled);
      toast.success(
        enabled
          ? `${row.venueName} can now create a community group`
          : `Community group access removed for ${row.venueName}`,
      );
      await load();
    } catch (e) {
      setRows(
        (prev) =>
          prev?.map((r) =>
            r.venueId === row.venueId ? { ...r, enabled: !enabled } : r,
          ) ?? prev,
      );
      toast.error(e instanceof Error ? e.message : "Could not update access.");
    } finally {
      setBusyId(null);
    }
  }

  function onToggle(row: VenueGroupAccessRow, next: boolean) {
    // Turning OFF a venue whose group already has members hides it from
    // players straight away — confirm first.
    if (!next && row.hasGroup) {
      setConfirmOff(row);
      return;
    }
    void apply(row, next);
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (rows ?? []).filter((r) => {
      if (filter === "enabled" && !r.enabled) return false;
      if (filter === "disabled" && r.enabled) return false;
      if (!q) return true;
      return (
        r.venueName.toLowerCase().includes(q) ||
        (r.area ?? "").toLowerCase().includes(q)
      );
    });
  }, [rows, query, filter]);

  const enabledCount = rows?.filter((r) => r.enabled).length ?? 0;
  const liveCount =
    rows?.filter((r) => r.enabled && r.hasGroup && r.groupActive).length ?? 0;
  const totalMembers =
    rows?.reduce(
      (n, r) => n + (r.enabled && r.groupActive ? r.memberCount : 0),
      0,
    ) ?? 0;

  return (
    <AdminShell>
      <div className="mx-auto max-w-6xl space-y-5 px-4 py-6 sm:px-6">
        <div>
          <h1 className="font-display text-2xl font-semibold text-foreground sm:text-3xl">
            Venues
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Choose which venues may open a community group for their players.
          </p>
        </div>

        <VenueSectionTabs />

        <div className="grid gap-3 sm:grid-cols-3">
          {[
            {
              icon: MessagesSquare,
              label: "Venues with access",
              value: rows ? enabledCount : "–",
            },
            {
              icon: MessagesSquare,
              label: "Groups live now",
              value: rows ? liveCount : "–",
            },
            {
              icon: Users,
              label: "Members in live groups",
              value: rows ? totalMembers : "–",
            },
          ].map((s) => (
            <div
              key={s.label}
              className="surface-card flex items-center gap-3 rounded-xl p-4"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <s.icon className="h-4 w-4" />
              </span>
              <div>
                <p className="text-xl font-semibold leading-none text-foreground">
                  {s.value}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">{s.label}</p>
              </div>
            </div>
          ))}
        </div>

        <p className="rounded-lg bg-secondary/60 px-3 py-2 text-xs text-muted-foreground">
          Off by default. When on, the venue's owner can create one announcement
          group from the Partner app; players join it from that venue's page
          only. The owner can pause or delete it at any time. Turning access off
          hides the group immediately and keeps its members and history in case
          you turn it back on.
        </p>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search venues…"
              className="h-9 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-sm outline-none focus:border-primary"
            />
          </div>
          <div className="flex rounded-lg border border-border p-0.5 text-xs font-semibold">
            {(
              [
                ["all", "All"],
                ["enabled", "Enabled"],
                ["disabled", "Not enabled"],
              ] as [Filter, string][]
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setFilter(id)}
                className={`rounded-md px-3 py-1.5 ${
                  filter === id
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="surface-card overflow-hidden rounded-xl">
          {loadError ? (
            <div className="p-8 text-center text-sm text-destructive">
              Couldn't load venues: {loadError}
              <div className="mt-3">
                <Button variant="outline" size="sm" onClick={() => void load()}>
                  Try again
                </Button>
              </div>
            </div>
          ) : rows === null ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-10 text-center text-sm text-muted-foreground">
              No venues match.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Venue</TableHead>
                  <TableHead>Group</TableHead>
                  <TableHead className="text-right">Members</TableHead>
                  <TableHead className="w-32 text-right">Allow group</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((row) => (
                  <TableRow key={row.venueId}>
                    <TableCell>
                      <Link
                        to="/venues/$venueId"
                        params={{ venueId: row.venueId }}
                        className="font-medium text-foreground hover:text-primary"
                      >
                        {row.venueName}
                      </Link>
                      {row.area ? (
                        <p className="text-xs text-muted-foreground">
                          {row.area}
                        </p>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <GroupStatus row={row} />
                    </TableCell>
                    <TableCell className="text-right text-sm text-muted-foreground">
                      {row.hasGroup ? row.memberCount : "–"}
                    </TableCell>
                    <TableCell className="text-right">
                      <Switch
                        checked={row.enabled}
                        disabled={busyId === row.venueId}
                        onCheckedChange={(next) => onToggle(row, next)}
                        aria-label={`Allow ${row.venueName} to create a community group`}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </div>

      <Dialog
        open={confirmOff !== null}
        onOpenChange={(o) => !o && setConfirmOff(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Turn off community group for {confirmOff?.venueName}?
            </DialogTitle>
            <DialogDescription>
              "{confirmOff?.groupName}" ({confirmOff?.memberCount ?? 0} members)
              will disappear from the venue page and the owner won't be able to
              post. Nothing is deleted — turn access back on to restore it.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOff(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                const row = confirmOff;
                setConfirmOff(null);
                if (row) void apply(row, false);
              }}
            >
              Turn off
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminShell>
  );
}
