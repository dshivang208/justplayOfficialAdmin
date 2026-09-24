# JustPlay Admin

Internal operations console for the JustPlay platform — Kanpur, India (single-city
launch). This is a **separate app** from the consumer app and the partner app: it's
for the internal JustPlay team only, and has no public signup. It runs on the
**same Supabase project** as the consumer and partner apps.

Shares the same design system (colors, `Playfair Display` + `Plus Jakarta Sans`
typography) as the consumer/partner apps for brand consistency, but is built for
the highest data density of the three — clarity and fast access to information
over visual polish.

## Build phases

**UI (Phases 1-5)** — all built, currently on mock data:

- [x] Phase 1 — Login + Dashboard Overview
- [x] Phase 2 — Venue & Partner Management
- [x] Phase 3 — Booking & User Management
- [x] Phase 4 — Payments, Payouts & Refunds Oversight
- [x] Phase 5 — Content, Discovery & Roles/Access

**Backend (replacing mock data with the real Supabase project)**:

- [x] **Backend Phase A** — Admin schema + Auth + full-access RLS
- [ ] Backend Phase B — Venue/Partner approval workflows (real data)
- [ ] Backend Phase C — Booking/User management (real data + override actions)
- [ ] Backend Phase D — Payments/Payout oversight (real data, reconciliation)
- [ ] Backend Phase E — Content, Coupons, Roles (real data + enforced access)

Only the **login screen** talks to real Supabase Auth right now. Every other
screen (Phases 2-5) still reads from `src/data/*.ts` mock files until its
Backend Phase lands.

## Backend Phase A — what's real now

- `supabase/migrations/20260901000000_admin_phase_a_schema.sql` —
  `admin_users`, `admin_audit_log`, `venue_commission`(+history), two
  admin-only columns added to existing tables (`users.status`,
  `bookings.payment_status`), role-check helper functions, an audit-logging
  trigger, and RLS policies across every existing table this app touches.
  **Six tables are assumed** (`partners`, `partner_venues`, `payouts`,
  `payout_line_items`, `payout_deductions`, `payout_accounts`) since only the
  consumer app's migration was available while building this — every policy
  touching one of those is guarded with `if to_regclass(...) is not null` so
  it's a no-op rather than a failure if the real names/shapes differ. Diff
  those sections against the partner app's actual migration before running
  this anywhere real.
- `supabase/functions/admin-otp-verify/` — phone OTP login, but unlike the
  consumer app's `mock-otp-verify`, this one **rejects any phone that isn't
  already in `admin_users`** — no self-provisioning branch exists.
- `src/lib/supabaseClient.ts` + `src/lib/admin-auth.tsx` — real
  `supabase.auth.signInWithPassword` / OTP session, namespaced
  `storageKey` so an admin session can't collide with a consumer/partner
  session in the same browser. Same public API as the old mock, so nothing
  downstream needed to change.
- `supabase/BOOTSTRAP_ADMIN.md` — there's no "Add admin" UI yet (that's
  Backend Phase E), so this is the one-time manual SQL to create the first
  `super_admin`.

The old "Viewing as" demo role switcher is gone — roles now come from each
admin's real `admin_users.role`. To see both role views, provision two admin
accounts (see BOOTSTRAP_ADMIN.md) and log in as each.

## Stack

TanStack Router (client-side, code-based route tree) + React 19 + Tailwind v4 +
shadcn/Radix primitives + recharts + `@supabase/supabase-js`, matching the
consumer/partner apps' toolset minus the Lovable-specific SSR plumbing (this is
an internal SPA behind auth, so no SSR is needed).

## Development

```sh
npm i
cp .env.example .env.local   # fill in the SAME Supabase project as consumer/partner
npm run dev                  # starts on http://localhost:5174
npm run build                # type-check + production build
```

Run the migration and read `supabase/BOOTSTRAP_ADMIN.md` before your first login.

## Project structure

```
src/
  components/
    admin/        — app-specific components (AdminShell, StatCard, charts, etc.)
    ui/            — shadcn/Radix primitives, shared conventions with consumer app
  data/            — mock data for Phases 2-5, structured for a clean API swap
  lib/             — auth (real Supabase), permissions, nav config, utils
  routes/          — one file per route/page
  router.tsx       — route tree
  main.tsx         — app entry
  styles.css       — design tokens (shared with consumer/partner apps)
supabase/
  migrations/      — SQL migrations (admin schema, RLS)
  functions/       — Edge Functions (admin-otp-verify)
  BOOTSTRAP_ADMIN.md
```
