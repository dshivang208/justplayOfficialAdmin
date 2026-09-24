import { useEffect, useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import { listBookingFlags } from "@/lib/admin-data/bookings";

const tabs = [
  { label: "All Bookings", href: "/bookings" },
  { label: "Disputes & No-Shows", href: "/bookings/disputes" },
] as const;

export function BookingSectionTabs() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [unresolvedCount, setUnresolvedCount] = useState(0);

  useEffect(() => {
    listBookingFlags()
      .then((flags) => setUnresolvedCount(flags.filter((f) => f.resolution === "unresolved").length))
      .catch(() => setUnresolvedCount(0));
  }, []);

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
            {tab.href === "/bookings/disputes" && unresolvedCount > 0 ? (
              <span className="rounded-full bg-destructive/10 px-1.5 py-0.5 text-[10px] font-bold text-destructive">
                {unresolvedCount}
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