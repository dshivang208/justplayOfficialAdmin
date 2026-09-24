import { Link } from "@tanstack/react-router";
import { AlertTriangle, ChevronRight, OctagonAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AlertItem } from "@/data/dashboard";

const severityStyles: Record<AlertItem["severity"], { chip: string; border: string }> = {
  critical: { chip: "bg-destructive/10 text-destructive", border: "border-l-destructive" },
  warning: { chip: "bg-warning/15 text-warning-foreground", border: "border-l-warning" },
  info: { chip: "bg-secondary text-secondary-foreground", border: "border-l-border" },
};

function SeverityIcon({ severity }: { severity: AlertItem["severity"] }) {
  if (severity === "critical") return <OctagonAlert className="h-4 w-4" />;
  return <AlertTriangle className="h-4 w-4" />;
}

export function AlertsPanel({ items }: { items: AlertItem[] }) {
  if (items.length === 0) {
    return (
      <div className="surface-card flex flex-col items-center justify-center gap-1 rounded-xl p-8 text-center">
        <p className="text-sm font-medium text-foreground">All clear</p>
        <p className="text-xs text-muted-foreground">No action items right now.</p>
      </div>
    );
  }

  return (
    <ul className="surface-card divide-y divide-border overflow-hidden rounded-xl">
      {items.map((item) => {
        const styles = severityStyles[item.severity];
        return (
          <li key={item.id}>
            <Link
              to={item.href}
              className={cn(
                "flex items-center gap-3 border-l-[3px] px-4 py-3 transition-colors hover:bg-secondary/60",
                styles.border,
              )}
            >
              <span className={cn("icon-chip h-8 w-8", styles.chip)}>
                <SeverityIcon severity={item.severity} />
              </span>
              <span className="flex-1 text-sm font-medium text-foreground">{item.message}</span>
              <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-primary">
                {item.actionLabel}
                <ChevronRight className="h-3.5 w-3.5" />
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export function AlertsPanelSkeleton() {
  return (
    <div className="surface-card divide-y divide-border overflow-hidden rounded-xl">
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex animate-pulse items-center gap-3 px-4 py-3">
          <div className="h-8 w-8 shrink-0 rounded-full bg-muted" />
          <div className="h-3 flex-1 rounded bg-muted" />
        </div>
      ))}
    </div>
  );
}
