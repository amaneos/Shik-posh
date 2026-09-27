import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Lazy singleton Supabase client.
 *
 * Reads SUPABASE_URL / SUPABASE_ANON_KEY from the environment. While no Supabase
 * project is connected (those vars are absent) the client is null and callers
 * MUST fall back to demo data — the app never crashes because of it.
 *
 * Note: anon-key reads are safe from the browser by design; real protection
 * comes from Row-Level Security, which arrives in a later step.
 */

interface EnvVars {
  SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
}

/** Reads env in both server (process.env) and client (import.meta.env) contexts. */
function readEnv(): EnvVars {
  const g = globalThis as { process?: { env?: Record<string, string | undefined> } };
  if (g.process?.env) return g.process.env as EnvVars;
  const meta = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
  return (meta ?? {}) as EnvVars;
}

export function isSupabaseConfigured(): boolean {
  const env = readEnv();
  return Boolean(env.SUPABASE_URL && env.SUPABASE_ANON_KEY);
}

let client: SupabaseClient | undefined;

export function getSupabaseClient(): SupabaseClient | null {
  const env = readEnv();
  const url = env.SUPABASE_URL;
  const anonKey = env.SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  if (client === undefined) {
    client = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        headers: { "x-application-name": "pooshakforush-white-label-storefront" },
      },
    });
  }
  return client;
}