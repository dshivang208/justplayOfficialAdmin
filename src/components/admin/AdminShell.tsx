import { useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { Bell, LogOut, Menu, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { navItems, BUILT_THROUGH_PHASE } from "@/lib/nav";
import { useAdminAuth } from "@/lib/admin-auth";
import { canAccessPath, isNavItemHidden, OPS_SUPPORT_PAYMENTS_HOME } from "@/lib/permissions";
import { listAdminAlerts, type AlertItem } from "@/lib/admin-data/alerts";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

function Logo() {
  return (
    <div className="flex items-center gap-2 px-1">
      <div className="gradient-primary flex h-8 w-8 items-center justify-center rounded-lg text-sm font-bold text-primary-foreground shadow-sm">
        JP
      </div>
      <div className="leading-tight">
        <p className="font-display text-sm font-semibold text-foreground">JustPlay</p>
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Admin Console
        </p>
      </div>
    </div>
  );
}

function SidebarLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { admin } = useAdminAuth();
  const role = admin?.role ?? "Super Admin";

  return (
    <nav className="flex flex-1 flex-col gap-1 px-3 py-4">
      {navItems.map((item) => {
        // Sections a role can't reach at all are dropped from the sidebar
        // entirely (not just blocked after clicking) — e.g. Roles & Access
        // for Ops/Support. Payments still shows, but routes to the one
        // sub-page (Refunds) that role can actually open.
        if (isNavItemHidden(role, item.href)) return null;
        const href =
          item.href === "/payments" && !canAccessPath(role, "/payments")
            ? OPS_SUPPORT_PAYMENTS_HOME
            : item.href;

        const isActive = pathname === href || pathname.startsWith(`${item.href}/`);
        const Icon = item.icon;
        const isLive = item.phase <= BUILT_THROUGH_PHASE;
        return (
          <Link
            key={item.href}
            to={href}
            onClick={onNavigate}
            className={cn(
              "group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all",
              isActive
                ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-sm"
                : "text-muted-foreground hover:translate-x-0.5 hover:bg-sidebar-accent/60 hover:text-foreground",
            )}
          >
            {isActive ? (
              <span className="absolute -left-3 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-primary" />
            ) : null}
            <Icon
              className={cn(
                "h-4 w-4 shrink-0 transition-colors",
                isActive ? "text-primary" : "text-muted-foreground group-hover:text-foreground",
              )}
            />
            <span className="flex-1">{item.label}</span>
            {!isLive ? (
              <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                Phase {item.phase}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}

function Topbar({ onMenuClick }: { onMenuClick: () => void }) {
  const { admin, logout } = useAdminAuth();
  const navigate = useNavigate();
  const role = admin?.role ?? "Super Admin";
  const [visibleAlerts, setVisibleAlerts] = useState<AlertItem[]>([]);
  const [alertsOpen, setAlertsOpen] = useState(false);

  useEffect(() => {
    listAdminAlerts(role)
      .then(setVisibleAlerts)
      .catch(() => setVisibleAlerts([]));
  }, [role]);

  const alertCount = visibleAlerts.length;

  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-surface/90 px-4 backdrop-blur">
      <button
        type="button"
        onClick={onMenuClick}
        className="rounded-full p-2 text-muted-foreground hover:bg-secondary lg:hidden"
        aria-label="Toggle navigation"
      >
        <Menu className="h-5 w-5" />
      </button>

      <div className="relative hidden max-w-sm flex-1 md:block">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="search"
          placeholder="Search venues, bookings, users…"
          className="h-9 w-full rounded-lg border border-input bg-background pl-9 pr-3 text-sm outline-none transition-shadow placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/30"
        />
      </div>

      <div className="ml-auto flex items-center gap-2">
        <div className="relative">
          <button
            type="button"
            onClick={() => setAlertsOpen((v) => !v)}
            className="relative rounded-full p-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            aria-label={alertCount > 0 ? `${alertCount} alerts` : "Alerts"}
          >
            <Bell className="h-5 w-5" />
            {alertCount > 0 ? (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground ring-2 ring-surface">
                {alertCount}
              </span>
            ) : null}
          </button>
          {alertsOpen ? (
            <div className="absolute right-0 top-11 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-border bg-surface shadow-lg">
              <div className="border-b border-border px-3.5 py-2.5">
                <p className="text-sm font-semibold text-foreground">Alerts</p>
              </div>
              {visibleAlerts.length === 0 ? (
                <div className="flex flex-col items-center gap-1.5 px-4 py-8 text-center">
                  <Bell className="h-5 w-5 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">Nothing needs your attention.</p>
                </div>
              ) : (
                <ul className="flex max-h-80 flex-col divide-y divide-border overflow-y-auto">
                  {visibleAlerts.map((a) => (
                    <li key={a.id}>
                      <Link
                        to={a.href}
                        onClick={() => setAlertsOpen(false)}
                        className="flex items-center gap-2.5 px-3.5 py-2.5 transition-colors hover:bg-secondary/60"
                      >
                        <span
                          className={cn(
                            "mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full",
                            a.severity === "critical" ? "bg-destructive" : "bg-accent",
                          )}
                        />
                        <span className="flex-1 text-sm text-foreground">{a.message}</span>
                        <span className="shrink-0 text-xs font-semibold text-primary">{a.actionLabel}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : null}
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger className="flex items-center gap-2 rounded-full py-1 pl-1 pr-3 transition-colors hover:bg-secondary">
            <Avatar className="h-7 w-7 ring-2 ring-primary/15">
              <AvatarFallback className="gradient-primary text-[11px] font-semibold text-primary-foreground">
                {admin?.avatarInitials ?? "?"}
              </AvatarFallback>
            </Avatar>
            <div className="hidden text-left leading-tight sm:block">
              <p className="text-xs font-semibold text-foreground">{admin?.name}</p>
              <p className="text-[10px] text-muted-foreground">{admin?.role}</p>
            </div>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="text-xs text-muted-foreground">
              Signed in as {admin?.email}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => {
                logout();
                void navigate({ to: "/login" });
              }}
            >
              <LogOut className="h-4 w-4" />
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}

export function AdminShell({ children }: { children: ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex min-h-screen bg-background">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar lg:flex">
        <div className="flex h-14 items-center border-b border-sidebar-border px-3">
          <Logo />
        </div>
        <SidebarLinks />
        <div className="border-t border-sidebar-border px-4 py-3">
          <p className="text-[11px] text-muted-foreground">Kanpur · Single-city launch</p>
        </div>
      </aside>

      {/* Mobile sidebar overlay */}
      {mobileOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Close navigation"
            className="absolute inset-0 bg-foreground/30 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="relative flex h-full w-64 flex-col bg-sidebar shadow-xl">
            <div className="flex h-14 items-center justify-between border-b border-sidebar-border px-3">
              <Logo />
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                className="rounded-full p-1.5 text-muted-foreground hover:bg-secondary"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <SidebarLinks onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      ) : null}

      <div className="flex min-h-screen flex-1 flex-col">
        <Topbar onMenuClick={() => setMobileOpen(true)} />
        <main className="flex-1 bg-background">{children}</main>
      </div>
    </div>
  );
}