import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Gamepad2, Loader2, Trophy, Users } from "lucide-react";
import { AdminShell } from "@/components/admin/AdminShell";
import { ContentSectionTabs } from "@/components/admin/ContentSectionTabs";
import { Switch } from "@/components/ui/switch";
import {
  listFeaturedVenues,
  listCommunityContent,
  setFeatured,
  reorderFeatured,
  type FeaturedVenue,
  type CommunityContentItem,
  type CommunityContentType,
} from "@/lib/admin-data/content";

const typeIcon: Record<CommunityContentType, typeof Gamepad2> = {
  hosted_game: Gamepad2,
  group: Users,
  event: Trophy,
};

const typeLabel: Record<CommunityContentType, string> = {
  hosted_game: "Hosted Game",
  group: "Group",
  event: "Event",
};

function FeaturedVenuesSection({
  venues,
  onChange,
}: {
  venues: FeaturedVenue[];
  onChange: () => void;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const featured = venues.filter((v) => v.isFeatured).sort((a, b) => (a.featuredOrder ?? 0) - (b.featuredOrder ?? 0));

  async function toggle(id: string, on: boolean) {
    setBusyId(id);
    try {
      await setFeatured("venue", id, on, on ? featured.length : null);
      onChange();
      toast.success(on ? "Added to featured venues" : "Removed from featured venues");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update this venue.");
    } finally {
      setBusyId(null);
    }
  }

  async function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= featured.length) return;
    const a = featured[index]!;
    const b = featured[target]!;
    setBusyId(a.id);
    try {
      await Promise.all([
        reorderFeatured("venue", a.id, b.featuredOrder ?? target),
        reorderFeatured("venue", b.id, a.featuredOrder ?? index),
      ]);
      onChange();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not reorder.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <h2 className="font-display text-base font-semibold text-foreground">Featured venues</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Shown in this order on the consumer app's homepage.
      </p>

      {featured.length > 0 ? (
        <ul className="surface-card mt-3 divide-y divide-border overflow-hidden rounded-xl">
          {featured.map((venue, index) => (
            <li key={venue.id} className="flex items-center gap-3 px-4 py-2.5">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-bold text-secondary-foreground">
                {index + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">{venue.name}</p>
                <p className="text-xs text-muted-foreground">{venue.area ?? venue.city}</p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-secondary disabled:opacity-40"
                  disabled={index === 0 || busyId !== null}
                  onClick={() => move(index, -1)}
                  aria-label="Move up"
                >
                  <ArrowUp className="h-3.5 w-3.5" />
                </button>
                <button
                  className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-secondary disabled:opacity-40"
                  disabled={index === featured.length - 1 || busyId !== null}
                  onClick={() => move(index, 1)}
                  aria-label="Move down"
                >
                  <ArrowDown className="h-3.5 w-3.5" />
                </button>
                <Switch
                  checked
                  disabled={busyId === venue.id}
                  onCheckedChange={(v) => toggle(venue.id, v)}
                />
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <div className="surface-card mt-3 rounded-xl p-6 text-center text-sm text-muted-foreground">
          No venues featured yet &mdash; toggle one on below.
        </div>
      )}

      <p className="mb-2 mt-5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        All active venues
      </p>
      <ul className="surface-card divide-y divide-border overflow-hidden rounded-xl">
        {venues
          .filter((v) => !v.isFeatured)
          .map((venue) => (
            <li key={venue.id} className="flex items-center gap-3 px-4 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">{venue.name}</p>
                <p className="text-xs text-muted-foreground">{venue.city}</p>
              </div>
              <Switch disabled={busyId === venue.id} onCheckedChange={(v) => toggle(venue.id, v)} />
            </li>
          ))}
      </ul>
    </div>
  );
}

function FeaturedCommunitySection({
  items,
  onChange,
}: {
  items: CommunityContentItem[];
  onChange: () => void;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const featured = [...items]
    .filter((i) => i.isFeatured)
    .sort((a, b) => (a.featuredOrder ?? 0) - (b.featuredOrder ?? 0));

  async function toggle(item: CommunityContentItem, on: boolean) {
    setBusyId(item.id);
    try {
      await setFeatured(item.type, item.id, on, on ? featured.length : null);
      onChange();
      toast.success(on ? "Added to featured content" : "Removed from featured content");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update this item.");
    } finally {
      setBusyId(null);
    }
  }

  async function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= featured.length) return;
    const a = featured[index]!;
    const b = featured[target]!;
    setBusyId(a.id);
    try {
      await Promise.all([
        reorderFeatured(a.type, a.id, b.featuredOrder ?? target),
        reorderFeatured(b.type, b.id, a.featuredOrder ?? index),
      ]);
      onChange();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not reorder.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="mt-8">
      <h2 className="font-display text-base font-semibold text-foreground">
        Featured hosted games, groups &amp; events
      </h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Shown in this order on the consumer app's landing page.
      </p>

      {featured.length > 0 ? (
        <ul className="surface-card mt-3 divide-y divide-border overflow-hidden rounded-xl">
          {featured.map((item, index) => {
            const Icon = typeIcon[item.type];
            return (
              <li key={item.id} className="flex items-center gap-3 px-4 py-2.5">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-bold text-secondary-foreground">
                  {index + 1}
                </span>
                <span className="icon-chip h-8 w-8 shrink-0 bg-primary/10 text-primary">
                  <Icon className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{item.title}</p>
                  <p className="text-xs text-muted-foreground">{item.subtitle}</p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-secondary disabled:opacity-40"
                    disabled={index === 0 || busyId !== null}
                    onClick={() => move(index, -1)}
                    aria-label="Move up"
                  >
                    <ArrowUp className="h-3.5 w-3.5" />
                  </button>
                  <button
                    className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-secondary disabled:opacity-40"
                    disabled={index === featured.length - 1 || busyId !== null}
                    onClick={() => move(index, 1)}
                    aria-label="Move down"
                  >
                    <ArrowDown className="h-3.5 w-3.5" />
                  </button>
                  <Switch checked disabled={busyId === item.id} onCheckedChange={(v) => toggle(item, v)} />
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="surface-card mt-3 rounded-xl p-6 text-center text-sm text-muted-foreground">
          Nothing featured yet &mdash; toggle something on below.
        </div>
      )}

      <p className="mb-2 mt-5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        All community content
      </p>
      <ul className="surface-card divide-y divide-border overflow-hidden rounded-xl">
        {items
          .filter((i) => !i.isFeatured)
          .map((item) => {
            const Icon = typeIcon[item.type];
            return (
              <li key={item.id} className="flex items-center gap-3 px-4 py-2.5">
                <span className="icon-chip h-8 w-8 shrink-0 bg-secondary text-secondary-foreground">
                  <Icon className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{item.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {typeLabel[item.type]} \u00b7 {item.subtitle}
                  </p>
                </div>
                <Switch disabled={busyId === item.id} onCheckedChange={(v) => toggle(item, v)} />
              </li>
            );
          })}
      </ul>
    </div>
  );
}

export function FeaturedContentPage() {
  const [venues, setVenues] = useState<FeaturedVenue[]>([]);
  const [community, setCommunity] = useState<CommunityContentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const refresh = () =>
    Promise.all([listFeaturedVenues(), listCommunityContent()]).then(([v, c]) => {
      setVenues(v);
      setCommunity(c);
    });

  useEffect(() => {
    setLoading(true);
    refresh()
      .catch((e) => setLoadError(e instanceof Error ? e.message : "Could not load content."))
      .finally(() => setLoading(false));
  }, []);

  return (
    <AdminShell>
      <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-4">
          <h1 className="font-display text-2xl font-semibold text-foreground sm:text-3xl">
            Content, Discovery &amp; Roles
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Control what's featured on the consumer app's homepage
          </p>
        </div>

        <ContentSectionTabs />

        {loadError && <p className="mt-4 text-sm font-medium text-destructive">{loadError}</p>}

        {loading ? (
          <div className="mt-8 flex justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="mt-5">
            <FeaturedVenuesSection venues={venues} onChange={refresh} />
            <FeaturedCommunitySection items={community} onChange={refresh} />
          </div>
        )}
      </div>
    </AdminShell>
  );
}