import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Plus, Trash2, Pencil } from "lucide-react";
import { AdminShell } from "@/components/admin/AdminShell";
import { Button } from "@/components/admin/Button";
import { ContentSectionTabs } from "@/components/admin/ContentSectionTabs";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
import {
  listEvents,
  createEvent,
  updateEvent,
  deleteEvent,
  type AdminEvent,
  type EventInput,
  type EventKind,
  type EventCtaType,
} from "@/lib/admin-data/events";
import { listFeaturedVenues, type FeaturedVenue } from "@/lib/admin-data/content";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

const EMPTY_INPUT: EventInput = {
  title: "",
  description: "",
  date: "",
  venueId: null,
  sport: "",
  entryFee: 0,
  feeUnit: "entry fee",
  participantLimit: 16,
  kind: "Tournament",
  timeLabel: "",
  ctaType: "register",
  imageUrl: "",
  organizerName: "JustPlay",
  organizerAbout: "",
};

function toInput(e: AdminEvent): EventInput {
  return {
    title: e.title,
    description: e.description ?? "",
    date: e.date,
    venueId: e.venueId,
    sport: e.sport,
    entryFee: e.entryFee,
    feeUnit: e.feeUnit,
    participantLimit: e.participantLimit,
    kind: e.kind,
    timeLabel: e.timeLabel ?? "",
    ctaType: e.ctaType,
    imageUrl: e.imageUrl ?? "",
    organizerName: e.organizerName,
    organizerAbout: e.organizerAbout ?? "",
  };
}

/** Shared create/edit form. `editing` is null for "create a new event", or
 *  the event being edited (its id is what tells the submit handler which
 *  RPC to call — the form fields themselves are identical either way). */
function EventFormDialog({
  open,
  onOpenChange,
  venues,
  editing,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  venues: FeaturedVenue[];
  editing: AdminEvent | null;
  onSaved: () => void;
}) {
  const [input, setInput] = useState<EventInput>(EMPTY_INPUT);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset the form to match whichever event (or blank) this dialog was
  // opened for, each time it opens.
  useEffect(() => {
    if (open) {
      setInput(editing ? toInput(editing) : EMPTY_INPUT);
      setError(null);
    }
  }, [open, editing]);

  const isValid =
    input.title.trim().length > 0 &&
    input.date.length > 0 &&
    input.sport.trim().length > 0 &&
    input.entryFee >= 0 &&
    input.participantLimit > 0;

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      if (editing) {
        await updateEvent(editing.id, input);
        toast.success(`"${input.title}" updated`);
      } else {
        await createEvent(input);
        toast.success(`"${input.title}" created`);
      }
      onOpenChange(false);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save this event.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !saving && onOpenChange(v)}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit event" : "Create an event or tournament"}</DialogTitle>
          <DialogDescription>
            {editing
              ? "Changes are visible on the Consumer app immediately."
              : "Goes live on the Consumer app immediately once created."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <Label htmlFor="ev-title">Title</Label>
            <Input
              id="ev-title"
              className="mt-1.5"
              placeholder="e.g. Monsoon Box Cricket Championship"
              value={input.title}
              onChange={(e) => setInput((p) => ({ ...p, title: e.target.value }))}
            />
          </div>

          <div>
            <Label htmlFor="ev-description">Description</Label>
            <Textarea
              id="ev-description"
              className="mt-1.5"
              rows={3}
              placeholder="What players should know before registering"
              value={input.description}
              onChange={(e) => setInput((p) => ({ ...p, description: e.target.value }))}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="ev-date">Date</Label>
              <Input
                id="ev-date"
                type="date"
                className="mt-1.5"
                value={input.date}
                onChange={(e) => setInput((p) => ({ ...p, date: e.target.value }))}
              />
            </div>
            <div>
              <Label htmlFor="ev-time">Time label</Label>
              <Input
                id="ev-time"
                className="mt-1.5"
                placeholder="e.g. 9:00 AM onwards"
                value={input.timeLabel}
                onChange={(e) => setInput((p) => ({ ...p, timeLabel: e.target.value }))}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="ev-sport">Sport</Label>
              <Input
                id="ev-sport"
                className="mt-1.5"
                placeholder="e.g. Box Cricket"
                value={input.sport}
                onChange={(e) => setInput((p) => ({ ...p, sport: e.target.value }))}
              />
            </div>
            <div>
              <Label>Type</Label>
              <Select
                value={input.kind}
                onValueChange={(v) => setInput((p) => ({ ...p, kind: v as EventKind }))}
              >
                <SelectTrigger className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Tournament">Tournament</SelectItem>
                  <SelectItem value="Coaching Camp">Coaching Camp</SelectItem>
                  <SelectItem value="Meetup">Meetup</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label>Venue (optional)</Label>
            <Select
              value={input.venueId ?? "none"}
              onValueChange={(v) => setInput((p) => ({ ...p, venueId: v === "none" ? null : v }))}
            >
              <SelectTrigger className="mt-1.5">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No specific venue</SelectItem>
                {venues.map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    {v.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="ev-fee">Entry fee (₹)</Label>
              <Input
                id="ev-fee"
                type="number"
                min={0}
                className="mt-1.5"
                value={input.entryFee}
                onChange={(e) => setInput((p) => ({ ...p, entryFee: Number(e.target.value) }))}
              />
            </div>
            <div>
              <Label htmlFor="ev-fee-unit">Fee unit</Label>
              <Input
                id="ev-fee-unit"
                className="mt-1.5"
                placeholder="e.g. per team"
                value={input.feeUnit}
                onChange={(e) => setInput((p) => ({ ...p, feeUnit: e.target.value }))}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="ev-limit">Participant limit</Label>
              <Input
                id="ev-limit"
                type="number"
                min={1}
                className="mt-1.5"
                value={input.participantLimit}
                onChange={(e) => setInput((p) => ({ ...p, participantLimit: Number(e.target.value) }))}
              />
              {editing && editing.participantCount > 0 && (
                <p className="mt-1 text-xs text-muted-foreground">
                  {editing.participantCount} already registered — the limit can't go below that.
                </p>
              )}
            </div>
            <div>
              <Label>Registration type</Label>
              <Select
                value={input.ctaType}
                onValueChange={(v) => setInput((p) => ({ ...p, ctaType: v as EventCtaType }))}
              >
                <SelectTrigger className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="register">Register (reserves a spot)</SelectItem>
                  <SelectItem value="interest">Register interest only</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label htmlFor="ev-image">Image URL (optional)</Label>
            <Input
              id="ev-image"
              className="mt-1.5"
              placeholder="https://…"
              value={input.imageUrl}
              onChange={(e) => setInput((p) => ({ ...p, imageUrl: e.target.value }))}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="ev-organizer">Organizer name</Label>
              <Input
                id="ev-organizer"
                className="mt-1.5"
                value={input.organizerName}
                onChange={(e) => setInput((p) => ({ ...p, organizerName: e.target.value }))}
              />
            </div>
            <div>
              <Label htmlFor="ev-organizer-about">Organizer note (optional)</Label>
              <Input
                id="ev-organizer-about"
                className="mt-1.5"
                value={input.organizerAbout}
                onChange={(e) => setInput((p) => ({ ...p, organizerAbout: e.target.value }))}
              />
            </div>
          </div>

          {error && <p className="text-sm font-medium text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button disabled={!isValid || saving} onClick={handleSave}>
            {saving ? "Saving…" : editing ? "Save changes" : "Create event"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function EventsPage() {
  const [events, setEvents] = useState<AdminEvent[]>([]);
  const [venues, setVenues] = useState<FeaturedVenue[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<AdminEvent | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminEvent | null>(null);
  const [deleting, setDeleting] = useState(false);

  const refresh = () => listEvents().then(setEvents);

  useEffect(() => {
    setLoading(true);
    Promise.all([listEvents(), listFeaturedVenues()])
      .then(([e, v]) => {
        setEvents(e);
        setVenues(v);
      })
      .catch((e) => setLoadError(e instanceof Error ? e.message : "Could not load events."))
      .finally(() => setLoading(false));
  }, []);

  function openCreate() {
    setEditingEvent(null);
    setFormOpen(true);
  }
  function openEdit(ev: AdminEvent) {
    setEditingEvent(ev);
    setFormOpen(true);
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteEvent(deleteTarget.id);
      await refresh();
      toast.success(`"${deleteTarget.title}" deleted`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not delete this event.");
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
              {loading ? "Loading…" : `${events.length} events & tournaments`}
            </p>
          </div>
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4" />
            Create event
          </Button>
        </div>

        <ContentSectionTabs />

        {loadError && <p className="mt-4 text-sm font-medium text-destructive">{loadError}</p>}

        {loading ? (
          <div className="mt-8 flex justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : events.length === 0 ? (
          <div className="surface-card mt-4 rounded-xl p-8 text-center text-sm text-muted-foreground">
            No events or tournaments yet — create the first one.
          </div>
        ) : (
          <div className="surface-card mt-4 overflow-hidden rounded-xl">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Title</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Sport</TableHead>
                  <TableHead>Entry fee</TableHead>
                  <TableHead>Registered</TableHead>
                  <TableHead className="w-16" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {events.map((ev) => (
                  <TableRow key={ev.id}>
                    <TableCell className="font-semibold text-foreground">{ev.title}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{ev.kind}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{formatDate(ev.date)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{ev.sport}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {ev.entryFee === 0 ? "Free" : `₹${ev.entryFee} ${ev.feeUnit}`}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {ev.participantCount} / {ev.participantLimit}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <button
                          className="text-muted-foreground hover:text-foreground"
                          onClick={() => openEdit(ev)}
                          aria-label="Edit event"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          className="text-muted-foreground hover:text-destructive"
                          onClick={() => setDeleteTarget(ev)}
                          aria-label="Delete event"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <EventFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        venues={venues}
        editing={editingEvent}
        onSaved={refresh}
      />

      <AlertDialog open={deleteTarget !== null} onOpenChange={(v) => !v && !deleting && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{deleteTarget?.title}"?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget && deleteTarget.participantCount > 0
                ? `${deleteTarget.participantCount} ${deleteTarget.participantCount === 1 ? "person has" : "people have"} already registered — they'll lose their spot and this can't be undone.`
                : "This can't be undone."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deleting}>
              {deleting ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminShell>
  );
}
