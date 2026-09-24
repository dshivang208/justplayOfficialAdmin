import { Link, useRouterState } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import { venues } from "@/data/venues";

const tabs = [
  { label: "All Venues", href: "/venues" },
  { label: "Approval Queue", href: "/venues/approvals" },
  { label: "Partners", href: "/venues/partners" },
] as const;

export function VenueSectionTabs() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const pendingCount = venues.filter((v) => v.status === "pending").length;

  return (
    <div className="flex items-center gap-1 border-b border-border">
      {tabs.map((tab) => {
        const isActive = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            to={tab.href}
            className={cn(
              "relative flex items-center gap-1.5 px-3 py-2.5 text-sm font-semibold transition-colors",
              isActive ? "text-primary" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {tab.label}
            {tab.href === "/venues/approvals" && pendingCount > 0 ? (
              <span className="rounded-full bg-destructive/10 px-1.5 py-0.5 text-[10px] font-bold text-destructive">
                {pendingCount}
              </span>
            ) : null}
            {isActive ? (
              <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-primary" />
            ) : null}
          </Link>
        );
      })}
    </div>
  );
}
