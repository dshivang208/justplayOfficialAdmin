import { useCallback, useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { ArrowRight, Building2, Check, X, Clock } from "lucide-react";
import { AdminShell } from "@/components/admin/AdminShell";
import { Button } from "@/components/admin/Button";
import { VenueSectionTabs, REVIEW_COUNTS_CHANGED } from "@/components/admin/VenueSectionTabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { listVenues, type Venue } from "@/lib/admin-data/venues";
import { listPartners, type Partner } from "@/lib/admin-data/partners";
import {
  listVenueChangeRequests,
  approveVenueChangeRequest,
  rejectVenueChangeRequest,
  type VenueChangeRequest,
} from "@/lib/admin-data/venueChangeRequests";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

/** "just now" / "3 hours ago" / "2 days ago" */
function waitingFor(iso: string | null) {
  if (!iso) return { label: "Recently", overdue: false };
  const ms = Date.now() - new Date(iso).getTime();
  const hours = Math.floor(ms / 3_600_000);
  const days = Math.floor(hours / 24);
  if (hours < 1) return { label: "Just now", overdue: false };
  if (hours < 24) return { label: `${hours} hour${hours === 1 ? "" : "s"} ago`, overdue: false };
  // Partners are told to expect an answer within a couple of business days.
  return { label: `${days} day${days === 1 ? "" : "s"} ago`, overdue: days >= 2 };
}

function DiffRow({ label, from, to }: { label: string; from: string; to: string }) {
  return (
    <div className="rounded-lg bg-secondary/60 px-3 py-2 text-xs">
      <p className="font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-muted-foreground line-through decoration-muted-foreground/50">{from}</p>
      <p className="mt-0.5 font-semibold text-foreground">{to}</p>
    </div>
  );
}

function ChangeRequestCard({
  request,
  busy,
  onApprove,
  onReject,
}: {
  request: VenueChangeRequest;
  busy: boolean;
  onApprove: () => void;
  onReject: () => void;
}) {
  const wait = waitingFor(request.requestedAt);
  return (
    <li className="surface-card rounded-xl p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <Link
            to="/venues/$venueId"
            params={{ venueId: request.venueId }}
            className="block truncate text-sm font-semibold text-foreground hover:text-primary"
          >
            {request.venueName}
          </Link>
          <p className="mt-0.5 inline-flex items-center gap-1 text-xs text-muted-foreground">
            <Building2 className="h-3 w-3" />
            {request.businessName ?? "Unknown business"} · {request.city}
          </p>
        </div>
        <span
          className={
            wait.overdue
              ? "inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] font-bold text-destructive"
              : "inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-[11px] font-semibold text-muted-foreground"
          }
        >
          <Clock className="h-3 w-3" /> Requested {wait.label}
        </span>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {request.pendingName && (
          <DiffRow label="Venue name" from={request.venueName} to={request.pendingName} />
        )}
        {request.pendingAddress && (
          <DiffRow label="Address" from={request.venueAddress} to={request.pendingAddress} />
        )}
      </div>

      <div className="mt-3 flex items-center justify-end gap-2">
        <Button variant="outline" size="sm" disabled={busy} onClick={onReject}>
          <X className="h-3.5 w-3.5" /> Reject
        </Button>
        <Button size="sm" disabled={busy} onClick={onApprove}>
          <Check className="h-3.5 w-3.5" /> {busy ? "Working…" : "Approve"}
        </Button>
      </div>
    </li>
  );
}

export function VenueApprovalsPage() {
  const [venues, setVenues] = useState<Venue[] | null>(null);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Loaded separately so a problem with one list never blanks the other.
  const [requests, setRequests] = useState<VenueChangeRequest[] | null>(null);
  const [requestsError, setRequestsError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<VenueChangeRequest | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectError, setRejectError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([listVenues(), listPartners()])
      .then(([v, p]) => {
        if (!active) return;
        setVenues(v);
        setPartners(p);
      })
      .catch((err: Error) => active && setLoadError(err.message));
    return () => {
      active = false;
    };
  }, []);

  const loadRequests = useCallback(async () => {
    try {
      setRequests(await listVenueChangeRequests());
      setRequestsError(null);
    } catch (e) {
      setRequestsError(e instanceof Error ? e.message : "Could not load change requests.");
      setRequests((prev) => prev ?? []);
    }
  }, []);

  useEffect(() => {
    void loadRequests();
  }, [loadRequests]);

  const afterDecision = async () => {
    await loadRequests();
    window.dispatchEvent(new Event(REVIEW_COUNTS_CHANGED));
  };

  async function handleApprove(r: VenueChangeRequest) {
    setBusyId(r.venueId);
    try {
      await approveVenueChangeRequest(r.venueId);
      toast.success(`Changes to "${r.venueName}" approved — live on the Consumer app now`);
      await afterDecision();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not approve this request.");
      await loadRequests(); // it may already have been handled elsewhere
    } finally {
      setBusyId(null);
    }
  }

  async function handleReject() {
    if (!rejecting) return;
    setBusyId(rejecting.venueId);
    setRejectError(null);
    try {
      await rejectVenueChangeRequest(rejecting.venueId, rejectReason);
      toast.success(`Request for "${rejecting.venueName}" rejected — the partner will see your reason`);
      setRejecting(null);
      setRejectReason("");
      await afterDecision();
    } catch (e) {
      setRejectError(e instanceof Error ? e.message : "Could not reject this request.");
    } finally {
      setBusyId(null);
    }
  }

  const pending = (venues ?? []).filter((v) => v.status === "pending");
  const requestCount = requests?.length ?? 0;
  const stillLoading = !venues || requests === null;
  const queueEmpty = !stillLoading && pending.length === 0 && requestCount === 0 && !requestsError;

  return (
    <AdminShell>
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-4">
          <h1 className="font-display text-2xl font-semibold text-foreground sm:text-3xl">
            Venue &amp; Partner Management
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {stillLoading
              ? "Loading…"
              : `${pending.length} new venue${pending.length === 1 ? "" : "s"} awaiting approval · ${requestCount} change request${requestCount === 1 ? "" : "s"}`}
          </p>
        </div>

        <VenueSectionTabs />

        <div className="mt-4 space-y-6">
          {(requestCount > 0 || requestsError) && (
            <section>
              <h2 className="text-sm font-semibold text-foreground">Change requests</h2>
              <p className="mb-2 text-xs text-muted-foreground">
                Partners asking to change a live venue's name or address
              </p>
              {requestsError ? (
                <div className="surface-card rounded-xl p-4 text-sm text-destructive">
                  Couldn't load change requests: {requestsError}
                </div>
              ) : (
                <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                  {(requests ?? []).map((r) => (
                    <ChangeRequestCard
                      key={r.venueId}
                      request={r}
                      busy={busyId === r.venueId}
                      onApprove={() => handleApprove(r)}
                      onReject={() => {
                        setRejecting(r);
                        setRejectReason("");
                        setRejectError(null);
                      }}
                    />
                  ))}
                </ul>
              )}
            </section>
          )}

          {loadError ? (
            <div className="surface-card rounded-xl p-10 text-center text-sm text-destructive">
              Couldn't load the approval queue: {loadError}
            </div>
          ) : !venues ? (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="surface-card flex gap-3 rounded-xl p-3.5">
                  <Skeleton className="h-20 w-24 shrink-0 rounded-lg" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-1/2" />
                    <Skeleton className="h-3 w-1/3" />
                  </div>
                </div>
              ))}
            </div>
          ) : queueEmpty ? (
            <div className="surface-card flex flex-col items-center justify-center gap-1 rounded-xl p-12 text-center">
              <p className="text-sm font-medium text-foreground">Queue is clear</p>
              <p className="text-xs text-muted-foreground">Nothing is waiting on a decision right now.</p>
            </div>
          ) : pending.length > 0 ? (
            <section>
              <h2 className="mb-2 text-sm font-semibold text-foreground">
                New venue applications
              </h2>
              <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {pending.map((venue) => {
                  const partner = venue.partnerId ? partners.find((p) => p.id === venue.partnerId) : undefined;
                  return (
                    <li key={venue.id}>
                      <Link
                        to="/venues/$venueId"
                        params={{ venueId: venue.id }}
                        className="surface-card surface-card-hover flex gap-3 rounded-xl p-3.5"
                      >
                        {venue.images[0] ? (
                          <img
                            src={venue.images[0]}
                            alt=""
                            className="h-20 w-24 shrink-0 rounded-lg object-cover"
                          />
                        ) : (
                          <div className="h-20 w-24 shrink-0 rounded-lg bg-muted" />
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <h3 className="truncate text-sm font-semibold text-foreground">
                              {venue.name}
                            </h3>
                            <span className="shrink-0 rounded-full bg-warning/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-warning-foreground">
                              Pending
                            </span>
                          </div>
                          <p className="mt-0.5 inline-flex items-center gap-1 text-xs text-muted-foreground">
                            <Building2 className="h-3 w-3" />
                            {partner?.businessName ?? "Unknown partner"}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {venue.city} · Submitted {formatDate(venue.submittedDate)}
                          </p>
                          <span className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-primary">
                            Review application <ArrowRight className="h-3 w-3" />
                          </span>
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}
        </div>
      </div>

      <Dialog open={rejecting !== null} onOpenChange={(v) => !v && busyId === null && setRejecting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject this change?</DialogTitle>
            <DialogDescription>
              {rejecting?.venueName} keeps its current name and address. The partner sees your reason
              in their Settings, so make it something they can act on.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <Label htmlFor="reject-reason">Reason for the partner</Label>
            <Textarea
              id="reject-reason"
              className="mt-1.5"
              rows={3}
              maxLength={500}
              placeholder="e.g. The name doesn't match the business registration"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
            />
            {rejectError && <p className="mt-2 text-sm font-medium text-destructive">{rejectError}</p>}
          </div>
          <DialogFooter>
            <Button variant="ghost" disabled={busyId !== null} onClick={() => setRejecting(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={busyId !== null || rejectReason.trim().length < 3}
              onClick={handleReject}
            >
              {busyId !== null ? "Rejecting…" : "Reject request"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminShell>
  );
}