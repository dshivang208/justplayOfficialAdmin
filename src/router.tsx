import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  redirect,
} from "@tanstack/react-router";
import { RequireAuth } from "@/components/admin/RequireAuth";
import { RequireRole } from "@/components/admin/RequireRole";
import { LoginPage } from "@/routes/login";
import { DashboardPage } from "@/routes/dashboard";
import { VenuesListPage } from "@/routes/venues";
import { VenueApprovalsPage } from "@/routes/venues.approvals";
import { VenueDetailPage } from "@/routes/venues.$venueId";
import { PartnersListPage } from "@/routes/venues.partners";
import { PartnerDetailPage } from "@/routes/venues.partners.$partnerId";
import { BookingsListPage } from "@/routes/bookings";
import { BookingDisputesPage } from "@/routes/bookings.disputes";
import { BookingDetailPage } from "@/routes/bookings.$bookingId";
import { UsersListPage } from "@/routes/users";
import { UserDetailPage } from "@/routes/users.$userId";
import { TransactionLogPage } from "@/routes/payments";
import { PayoutOversightPage } from "@/routes/payments.payouts";
import { RefundQueuePage } from "@/routes/payments.refunds";
import { FinancialSummaryPage } from "@/routes/payments.summary";
import { FeaturedContentPage } from "@/routes/content";
import { CouponsPage } from "@/routes/content.coupons";
import { NotificationsPage } from "@/routes/content.notifications";
import { AdminRolesPage } from "@/routes/roles";

function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-2 bg-background px-4 text-center">
      <h1 className="font-display text-4xl font-semibold text-foreground">404</h1>
      <p className="text-sm text-muted-foreground">This page doesn't exist in the admin console.</p>
      <a href="/dashboard" className="mt-4 text-sm font-medium text-primary hover:underline">
        Back to dashboard
      </a>
    </div>
  );
}

const rootRoute = createRootRoute({
  component: () => <Outlet />,
  notFoundComponent: NotFound,
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  beforeLoad: () => {
    throw redirect({ to: "/dashboard" });
  },
});

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/login",
  component: LoginPage,
});

function protectedRoute<TPath extends string>(path: TPath, component: React.ComponentType) {
  const Component = component;
  return createRoute({
    getParentRoute: () => rootRoute,
    path,
    component: () => (
      <RequireAuth>
        <Component />
      </RequireAuth>
    ),
  });
}

/**
 * Like protectedRoute, but also gates the page behind the role check for
 * `path` (see src/lib/permissions.ts). Direct URL navigation is blocked
 * here regardless of whether the sidebar/tabs hid the link — that's what
 * makes the restriction real rather than cosmetic.
 */
function restrictedRoute<TPath extends string>(
  path: TPath,
  component: React.ComponentType,
  note: string,
) {
  const Component = component;
  return createRoute({
    getParentRoute: () => rootRoute,
    path,
    component: () => (
      <RequireAuth>
        <RequireRole path={path} note={note}>
          <Component />
        </RequireRole>
      </RequireAuth>
    ),
  });
}

const dashboardRoute = protectedRoute("/dashboard", DashboardPage);

// Venue & Partner Management (Phase 2) — static paths declared before the
// dynamic $venueId / $partnerId ones so they're never shadowed.
const venuesRoute = protectedRoute("/venues", VenuesListPage);
const venueApprovalsRoute = protectedRoute("/venues/approvals", VenueApprovalsPage);
const venuePartnersRoute = protectedRoute("/venues/partners", PartnersListPage);
const venuePartnerDetailRoute = protectedRoute(
  "/venues/partners/$partnerId",
  PartnerDetailPage,
);
const venueDetailRoute = protectedRoute("/venues/$venueId", VenueDetailPage);

// Booking & User Management (Phase 3)
const bookingsRoute = protectedRoute("/bookings", BookingsListPage);
const bookingDisputesRoute = protectedRoute("/bookings/disputes", BookingDisputesPage);
const bookingDetailRoute = protectedRoute("/bookings/$bookingId", BookingDetailPage);
const usersRoute = protectedRoute("/users", UsersListPage);
const userDetailRoute = protectedRoute("/users/$userId", UserDetailPage);

// Payments, Payouts & Refunds Oversight (Phase 4) — Transactions, Payouts,
// and Summary are Super-Admin-only financial views; Refunds stays open to
// Ops/Support since refund approval is part of their job.
const paymentsRoute = restrictedRoute(
  "/payments",
  TransactionLogPage,
  "The transaction log shows raw payment data — Ops/Support doesn't have financial access. You can still approve or reject refund requests from Payments \u2192 Refunds.",
);
const paymentsPayoutsRoute = restrictedRoute(
  "/payments/payouts",
  PayoutOversightPage,
  "Payout oversight is Super Admin only. Ops/Support can still approve or reject refund requests from Payments \u2192 Refunds.",
);
const paymentsRefundsRoute = protectedRoute("/payments/refunds", RefundQueuePage);
const paymentsSummaryRoute = restrictedRoute(
  "/payments/summary",
  FinancialSummaryPage,
  "GMV, commission, and revenue figures are Super Admin only.",
);

// Content, Discovery & Roles/Access (Phase 5)
const contentRoute = protectedRoute("/content", FeaturedContentPage);
const contentCouponsRoute = protectedRoute("/content/coupons", CouponsPage);
const contentNotificationsRoute = protectedRoute("/content/notifications", NotificationsPage);
const rolesRoute = restrictedRoute(
  "/roles",
  AdminRolesPage,
  "Managing admin accounts and roles is Super Admin only.",
);

const routeTree = rootRoute.addChildren([
  indexRoute,
  loginRoute,
  dashboardRoute,
  venuesRoute,
  venueApprovalsRoute,
  venuePartnersRoute,
  venuePartnerDetailRoute,
  venueDetailRoute,
  bookingsRoute,
  bookingDisputesRoute,
  bookingDetailRoute,
  usersRoute,
  userDetailRoute,
  paymentsRoute,
  paymentsPayoutsRoute,
  paymentsRefundsRoute,
  paymentsSummaryRoute,
  contentRoute,
  contentCouponsRoute,
  contentNotificationsRoute,
  rolesRoute,
]);

export function getRouter() {
  return createRouter({
    routeTree,
    defaultPreloadStaleTime: 0,
  });
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
