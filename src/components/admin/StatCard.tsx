import { ArrowDownRight, ArrowUpRight, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SummaryMetric } from "@/data/dashboard";

const iconTint: Record<string, string> = {
  primary: "bg-primary/10 text-primary",
  accent: "bg-accent/15 text-accent-foreground",
  info: "bg-[oklch(0.58_0.12_235)]/10 text-[oklch(0.5_0.13_235)]",
};

export function StatCard({
  metric,
  icon: Icon,
  tint = "primary",
}: {
  metric: SummaryMetric;
  icon: LucideIcon;
  tint?: "primary" | "accent" | "info";
}) {
  return (
    <div className="surface-card surface-card-hover rounded-xl p-4">
      <div className="flex items-start justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {metric.label}
        </p>
        <span className={cn("icon-chip h-8 w-8", iconTint[tint])}>
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <p className="mt-3 font-display text-2xl font-semibold text-foreground">{metric.value}</p>
      {metric.delta ? (
        <div
          className={cn(
            "mt-2 inline-flex items-center gap-1 text-xs font-semibold",
            metric.deltaDirection === "down" ? "text-destructive" : "text-primary",
          )}
        >
          {metric.deltaDirection === "down" ? (
            <ArrowDownRight className="h-3.5 w-3.5" />
          ) : (
            <ArrowUpRight className="h-3.5 w-3.5" />
          )}
          {metric.delta}
        </div>
      ) : metric.hint ? (
        <p className="mt-2 text-xs text-muted-foreground">{metric.hint}</p>
      ) : null}
    </div>
  );
}

export function StatCardSkeleton() {
  return (
    <div className="surface-card animate-pulse rounded-xl p-4">
      <div className="flex items-start justify-between">
        <div className="h-3 w-24 rounded bg-muted" />
        <div className="h-8 w-8 rounded-full bg-muted" />
      </div>
      <div className="mt-4 h-7 w-16 rounded bg-muted" />
      <div className="mt-3 h-3 w-20 rounded bg-muted" />
    </div>
  );
}
