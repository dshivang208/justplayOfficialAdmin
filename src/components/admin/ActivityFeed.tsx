import { Building2, CalendarPlus, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ActivityItem, ActivityType } from "@/data/dashboard";

const typeStyles: Record<ActivityType, { icon: typeof CalendarPlus; className: string }> = {
  booking: { icon: CalendarPlus, className: "bg-primary/10 text-primary" },
  cancellation: { icon: XCircle, className: "bg-destructive/10 text-destructive" },
  venue_signup: { icon: Building2, className: "bg-accent/15 text-accent-foreground" },
};

const IST = "Asia/Kolkata";

/** "25 Oct 2026" and "9:41 PM", always in Kanpur time. */
function formatWhen(iso: string) {
  const d = new Date(iso);
  const date = d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: IST });
  const time = d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: IST });
  return { date, time: time.toUpperCase() };
}

export function ActivityFeed({ items }: { items: ActivityItem[] }) {
  if (items.length === 0) {
    return (
      <div className="surface-card flex flex-col items-center justify-center gap-1 rounded-xl p-8 text-center">
        <p className="text-sm font-medium text-foreground">No activity yet</p>
        <p className="text-xs text-muted-foreground">Platform activity will show up here.</p>
      </div>
    );
  }

  return (
    <ul className="surface-card divide-y divide-border overflow-hidden rounded-xl">
      {items.map((item) => {
        const { icon: Icon, className } = typeStyles[item.type];
        return (
          <li
            key={item.id}
            className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-secondary/50"
          >
            <span className={cn("icon-chip mt-0.5 h-8 w-8", className)}>
              <Icon className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground">{item.title}</p>
              <p className="truncate text-xs text-muted-foreground">{item.subtitle}</p>
            </div>
            <time dateTime={item.timestamp} className="shrink-0 text-right leading-tight">
              <span className="block text-xs font-medium text-foreground">{formatWhen(item.timestamp).date}</span>
              <span className="block text-[11px] text-muted-foreground">{formatWhen(item.timestamp).time}</span>
            </time>
          </li>
        );
      })}
    </ul>
  );
}

export function ActivityFeedSkeleton() {
  return (
    <div className="surface-card divide-y divide-border overflow-hidden rounded-xl">
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} className="flex animate-pulse items-start gap-3 px-4 py-3">
          <div className="h-8 w-8 shrink-0 rounded-full bg-muted" />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-3/4 rounded bg-muted" />
            <div className="h-3 w-1/2 rounded bg-muted" />
          </div>
        </div>
      ))}
    </div>
  );
}
