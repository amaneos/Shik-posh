import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Lazy singleton Supabase client.
 *
 * Reads SUPABASE_URL / SUPABASE_ANON_KEY from the environment. While no Supabase
 * project is connected (those vars are absent) the client is null and callers
 * MUST fall back to demo data — the app never crashes because of it.
 *
 * Note: anon-key reads are safe from the browser by design; real protection
 * comes from Row-Level Security (supabase/migrations/0005_customer_accounts.sql
 * tightens orders / order_items / customer_profiles).
 *
 * Session persistence (STEP 6): in the BROWSER the client keeps the auth session
 * in localStorage and refreshes its token automatically, so a signed-in customer
 * stays signed in across reloads. On the SERVER the client is deliberately
 * session-less (`persistSession: false`, no storage) — the server must never
 * read or write a browser session, and the cookie-free setup keeps `data.ts` /
 * `store-settings.ts` reads working exactly as before.
 */
interface EnvVars {
  SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
  /** Vite-style aliases, for deployments that only can expose VITE_* vars. */
  VITE_SUPABASE_URL?: string;
  VITE_SUPABASE_ANON_KEY?: string;
}

/** Reads env in both server (process.env) and client (import.meta.env) contexts. */
function readEnv(): EnvVars {
  const g = globalThis as { process?: { env?: Record<string, string | undefined> } };
  const fromProcess = g.process?.env;
  const meta = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
  // process.env first (server, and the build-time `define` in vite.config.ts),
  // then import.meta.env (Vite client bundle). Both spellings are honoured so a
  // client store can be activated with either SUPABASE_* or VITE_SUPABASE_*.
  return {
    SUPABASE_URL: fromProcess?.SUPABASE_URL ?? meta?.SUPABASE_URL ?? meta?.VITE_SUPABASE_URL,
    SUPABASE_ANON_KEY:
      fromProcess?.SUPABASE_ANON_KEY ?? meta?.SUPABASE_ANON_KEY ?? meta?.VITE_SUPABASE_ANON_KEY,
  };
}

export function isSupabaseConfigured(): boolean {
  const env = readEnv();
  return Boolean(env.SUPABASE_URL && env.SUPABASE_ANON_KEY);
}

/**
 * Neutral localStorage key for the auth session (white-label: no brand string).
 * Distinct from the cart/orders keys, so clearing a cart never signs anyone out.
 */
export const AUTH_STORAGE_KEY = "pooshak-auth-v1";

/** True when running in a real browser (never during SSR). */
export function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

let client: SupabaseClient | undefined;

export function getSupabaseClient(): SupabaseClient | null {
  const env = readEnv();
  const url = env.SUPABASE_URL;
  const anonKey = env.SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  if (client === undefined) {
    const browser = isBrowser();
    client = createClient(url, anonKey, {
      auth: browser
        ? {
            // Persist + refresh the session in the browser only.
            persistSession: true,
            autoRefreshToken: true,
            // No OAuth/magic-link redirect handling in this step.
            detectSessionInUrl: false,
            storage: window.localStorage,
            storageKey: AUTH_STORAGE_KEY,
          }
        : {
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false,
          },
      global: {
        headers: { "x-application-name": "pooshakforush-white-label-storefront" },
      },
    });
  }
  return client;
}
