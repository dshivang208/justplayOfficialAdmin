/**
 * App-level auth state for JustPlay Admin (Backend Phase A).
 *
 * Real Supabase Auth session + a real `public.admin_users` row — OTP
 * delivery itself is still mocked (no SMS provider wired up), same as the
 * consumer app. The exported shape of this module (types, `useAdminAuth()`
 * fields, function signatures) is UNCHANGED from the Phase 1 mock, so
 * every route/component built in Phases 1-5 keeps working without edits.
 *
 * What actually changed vs. the mock:
 *   • loginWithPassword now calls supabase.auth.signInWithPassword, then
 *     requires a matching public.admin_users row to exist — a Supabase
 *     Auth user with no admin_users row is signed back out immediately.
 *   • verifyOtp now calls the `admin-otp-verify` Edge Function (which
 *     REJECTS unprovisioned phone numbers server-side) and redeems the
 *     returned token client-side, exactly like the consumer app's OTP flow.
 *   • Role no longer lives in localStorage — it's whatever `role` column
 *     the authenticated admin's admin_users row actually has. The old
 *     "Viewing as" demo switcher is gone: to see both role views now, log
 *     in as two real provisioned admins (see the migration's seed notes).
 *
 * SWAP POINT FOR REAL SMS: exactly like the consumer app, only the
 * `admin-otp-verify` Edge Function's OTP-validation step changes when a
 * real SMS provider is wired up. This file, the RLS policies, and every
 * downstream screen stay as-is.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabaseClient";

export type AdminRole = "Super Admin" | "Ops/Support";

export type AdminUser = {
  id: string;
  name: string;
  email: string;
  role: AdminRole;
  avatarInitials: string;
};

/** DB stores roles as 'super_admin' | 'ops_support' — the rest of the app
 * (built in Phases 1-5) uses the display form everywhere, so that boundary
 * lives here and nowhere else. */
function dbRoleToDisplay(role: string): AdminRole {
  return role === "super_admin" ? "Super Admin" : "Ops/Support";
}

function initialsFrom(name: string, fallback: string) {
  const trimmed = name.trim();
  if (!trimmed) return fallback.slice(0, 2).toUpperCase();
  const parts = trimmed.split(/\s+/);
  return (parts[0]?.[0] ?? "" + (parts[1]?.[0] ?? "")).slice(0, 2).toUpperCase() || fallback.slice(0, 2).toUpperCase();
}

type AdminUsersRow = {
  id: string;
  name: string;
  role: string;
  email: string | null;
  phone: string | null;
};

function rowToAdmin(row: AdminUsersRow): AdminUser {
  const label = row.email ?? row.phone ?? row.id;
  return {
    id: row.id,
    name: row.name || label,
    email: row.email ?? "",
    role: dbRoleToDisplay(row.role),
    avatarInitials: initialsFrom(row.name, label),
  };
}

async function fetchAdminRow(userId: string): Promise<AdminUsersRow | null> {
  const { data, error } = await supabase
    .from("admin_users")
    .select("id, name, role, email, phone")
    .eq("id", userId)
    .maybeSingle();
  if (error) {
    console.error("Failed to load admin profile:", error.message);
    return null;
  }
  return data as AdminUsersRow | null;
}

function normalizePhone(input: string) {
  return input.replace(/\D/g, "").slice(-10);
}

/** Shown as demo hints on the login screen — any 6-digit code works today. */
export const DEMO_OTP = "123456";

type AuthContextValue = {
  admin: AdminUser | null;
  isAuthenticated: boolean;
  hydrated: boolean;
  loginWithPassword: (email: string, password: string) => Promise<void>;
  requestOtp: (phone: string) => Promise<void>;
  verifyOtp: (phone: string, code: string) => Promise<void>;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [admin, setAdmin] = useState<AdminUser | null>(null);
  const [hydrated, setHydrated] = useState(false);

  // Real session bootstrap: restore on refresh, then stay in sync with any
  // auth state change (login/logout/token refresh, including other tabs).
  useEffect(() => {
    let active = true;

    void (async () => {
      const {
        data: { session: initialSession },
      } = await supabase.auth.getSession();
      if (!active) return;
      if (initialSession) {
        const row = await fetchAdminRow(initialSession.user.id);
        if (!active) return;
        if (row) {
          setSession(initialSession);
          setAdmin(rowToAdmin(row));
        } else {
          // A Supabase Auth session exists but there's no admin_users row
          // for it — not an admin account. Don't leave a half-logged-in
          // state sitting around.
          void supabase.auth.signOut();
        }
      }
      setHydrated(true);
    })();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      if (newSession) {
        void fetchAdminRow(newSession.user.id).then((row) => {
          if (active) setAdmin(row ? rowToAdmin(row) : null);
        });
      } else {
        setAdmin(null);
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const loginWithPassword = useCallback(async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (error || !data.session) {
      throw new Error(error?.message ?? "Incorrect email or password.");
    }

    const row = await fetchAdminRow(data.session.user.id);
    if (!row) {
      await supabase.auth.signOut();
      throw new Error(
        "This account isn't provisioned for admin access. Contact IT if you think this is a mistake.",
      );
    }

    setSession(data.session);
    setAdmin(rowToAdmin(row));
  }, []);

  /** SWAP POINT (send step): no-op today since there's no SMS provider yet. */
  const requestOtp = useCallback(async (_phone: string) => {
    await new Promise((r) => setTimeout(r, 700));
  }, []);

  /** supabase-js's FunctionsHttpError.message is just a generic
   *  "Edge Function returned a non-2xx status code" — the actual reason
   *  our own functions send back (e.g. "This phone number isn't
   *  registered for admin access") sits unread on error.context, the raw
   *  Response object, and has to be parsed out manually. */
  async function extractFunctionErrorMessage(error: unknown, fallback: string): Promise<string> {
    const context = (error as { context?: unknown } | null)?.context;
    if (context instanceof Response) {
      try {
        const body = await context.clone().json();
        if (typeof body?.error === "string") return body.error;
      } catch {
        // Response wasn't JSON — fall through to the generic message below.
      }
    }
    return error instanceof Error && error.message ? error.message : fallback;
  }

  /** SWAP POINT (verify step): mock-checks the code, then mints a REAL
   * session — but only for a phone the admin-otp-verify function finds in
   * public.admin_users. Unlike the consumer app, there is no "new admin"
   * branch: an unrecognized phone is rejected, never provisioned. */
  const verifyOtp = useCallback(async (phone: string, code: string) => {
    if (!/^\d{6}$/.test(code)) throw new Error("Enter the 6-digit code we sent you.");

    const digits = normalizePhone(phone);
    if (digits.length !== 10) throw new Error("Enter a valid 10-digit Indian mobile number.");

    const { data: fnData, error: fnError } = await supabase.functions.invoke<{
      tokenHash: string;
      admin: AdminUsersRow;
    }>("admin-otp-verify", {
      body: { phone: digits, otp: code },
    });

    if (fnError) {
      throw new Error(
        await extractFunctionErrorMessage(fnError, "This phone isn't registered for admin access."),
      );
    }
    if (!fnData) throw new Error("Verification failed. Try again.");

    const { data: verifyData, error: verifyError } = await supabase.auth.verifyOtp({
      token_hash: fnData.tokenHash,
      type: "magiclink",
    });
    if (verifyError || !verifyData.session) {
      throw new Error(verifyError?.message ?? "Could not start session. Try again.");
    }

    setSession(verifyData.session);
    setAdmin(rowToAdmin(fnData.admin));
  }, []);

  const logout = useCallback(() => {
    void supabase.auth.signOut();
    setSession(null);
    setAdmin(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      admin,
      isAuthenticated: session !== null && admin !== null,
      hydrated,
      loginWithPassword,
      requestOtp,
      verifyOtp,
      logout,
    }),
    [admin, session, hydrated, loginWithPassword, requestOtp, verifyOtp, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAdminAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAdminAuth must be used within AdminAuthProvider");
  return ctx;
}