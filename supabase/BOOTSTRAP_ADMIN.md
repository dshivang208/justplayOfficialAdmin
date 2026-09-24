# Bootstrapping the first admin account

There's no self-signup for this app, and Phase E's "Add admin" flow (the
proper in-app way to provision new admins) doesn't exist yet. Until then,
creating the very first `super_admin` — the one who'll use "Add admin"
once it exists — is a two-step manual process.

Run Phase A's migration first (`20260901000000_admin_phase_a_schema.sql`),
then do this **once**, on the same Supabase project the consumer and
partner apps use.

## Step 1 — create the auth user

**Dashboard:** Authentication → Users → Add user. Set an email and a
password. Leave "Auto Confirm User" checked so they can sign in
immediately.

**Or via the CLI / SQL Editor**, using the service role (never the anon
key) from a trusted environment:

```sql
-- Run this via the Supabase SQL Editor, or call auth.admin.createUser
-- from a one-off script using the service role key. Either way, note the
-- resulting user's id for step 2.
select id from auth.users where email = 'you@justplay.in';
```

If that returns nothing, create the user first (Dashboard is simplest for
a one-time bootstrap), then re-run the query above to get their `id`.

## Step 2 — provision the admin_users row

```sql
insert into public.admin_users (id, email, name, role)
values (
  '00000000-0000-0000-0000-000000000000', -- the id from step 1
  'you@justplay.in',
  'Your Name',
  'super_admin'
);
```

That's it — they can now sign in on the admin app's login screen with
that email/password, and every RLS policy in Phase A will recognize them
as `super_admin`.

## For a phone-based (OTP) admin instead

Phone login goes through the `admin-otp-verify` Edge Function, which looks
up `admin_users.phone` directly — you don't need an `auth.users` row to
already exist for the phone number the way email/password does, because
`generateLink` creates one on first use. Just insert the `admin_users` row
with `phone` set (E.164, e.g. `+919876543210`) and no `id` yet... except
`id` is a required primary key referencing `auth.users`. Simplest path
today: still create the `auth.users` row via the Dashboard first (any
placeholder email works, it's never shown anywhere), grab its `id`, then
run the same insert as Step 2 with `phone` set instead of/alongside
`email`.

## Adding a second admin to test both roles

Repeat both steps with `role => 'ops_support'`. Log in as each in separate
browser profiles (or one at a time) to see the role-based restrictions
from Phase 5 actually enforced against real data instead of the old
"Viewing as" demo switcher, which has been removed now that roles come
from the database.
