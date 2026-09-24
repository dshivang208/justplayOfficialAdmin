/**
 * Single shared Supabase client for the admin app's browser.
 *
 * Same Supabase PROJECT as the consumer and partner apps (same URL/anon
 * key), but a distinct auth session: `storageKey` is namespaced so an
 * admin session in one browser tab never collides with or overwrites a
 * consumer/partner session for the same person in another tab on the same
 * device. The actual identity separation (admin vs. consumer vs. partner)
 * is enforced server-side by which table has a row for a given
 * auth.users.id — see supabase/migrations — not by anything client-side.
 */
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env["VITE_SUPABASE_URL"] as string | undefined;
const supabaseAnonKey = import.meta.env["VITE_SUPABASE_ANON_KEY"] as string | undefined;

if (!supabaseUrl || !supabaseAnonKey) {
  // Fail loudly in the console rather than have every auth call silently
  // reject with a cryptic network error.
  console.error(
    "Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. Copy .env.example to " +
      ".env.local and fill in the SAME project's URL + anon key used by the " +
      "consumer and partner apps.",
  );
}

export const supabase = createClient(supabaseUrl ?? "", supabaseAnonKey ?? "", {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
    storageKey: "justplay-admin.supabase.auth",
  },
});

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);
