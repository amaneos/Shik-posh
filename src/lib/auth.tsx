/**
 * Customer accounts (STEP 6) — Supabase Auth + the store-side profile.
 *
 * This module is the ONLY place the storefront talks to Supabase Auth. It keeps
 * three rules that the rest of the app relies on:
 *
 *  1. NOTHING IS FAKED. Without SUPABASE_URL + SUPABASE_ANON_KEY the provider
 *     reports `status: "unconfigured"` and every account surface renders a
 *     "connect the database" state. No demo user, no demo session, and — unlike
 *     the catalog, which has a demo-data branch — no demo fallback at all: a
 *     fake login would be worse than no login.
 *  2. SSR-SAFE, NO FLASH. The initial status is always `"loading"` (server and
 *     first client render agree, so hydration matches) and the session is
 *     restored in an effect after mount. Only then does it become
 *     `"signedIn"` / `"signedOut"` / `"unconfigured"`.
 *  3. THE PROFILE IS DEFENCE-IN-DEPTH. The migration's `on_auth_user_created`
 *     trigger creates `customer_profiles` on sign-up; `ensureProfile()` here
 *     re-creates it if the trigger is missing (e.g. migrations applied by hand
 *     later), so the account area never shows an empty shell.
 *
 * Auth method: email + password only. Phone-OTP is deliberately absent (it needs
 * an SMS provider, which this white-label deployment does not have).
 */

import type { SupabaseClient, User } from "@supabase/supabase-js";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { isSupabaseConfigured } from "~/lib/supabase";

/* ── Types ─────────────────────────────────────────────────────────────────── */

export type AuthStatus = "loading" | "signedOut" | "signedIn" | "unconfigured";

/** The store-side profile row (public.customer_profiles). */
export interface CustomerProfile {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

/** What a caller may change. Email lives in Auth; name/phone in the profile. */
export interface ProfileInput {
  name: string;
  phone?: string | null;
  email?: string | null;
}

export interface RegisterInput {
  email: string;
  password: string;
  name: string;
  phone?: string;
}

/** Result of a sign-in / sign-up / sign-out attempt (Persian message on failure). */
export type AuthResult = { ok: true; message?: string } | { ok: false; message: string };

interface AuthContextValue {
  user: User | null;
  profile: CustomerProfile | null;
  status: AuthStatus;
  /** True while a profile fetch/refresh is in flight. */
  profileLoading: boolean;
  signIn: (email: string, password: string) => Promise<AuthResult>;
  signUp: (input: RegisterInput) => Promise<AuthResult>;
  signOut: () => Promise<AuthResult>;
  refreshProfile: () => Promise<void>;
  updateProfile: (input: ProfileInput) => Promise<AuthResult>;
}

/* ── Persian messages (the only place they live) ───────────────────────────── */

export const AUTH_CONFIG_MESSAGE =
  "دیتابیس فروشگاه متصل نیست؛ برای فعال‌سازی حساب کاربری و پیگیری سفارش‌ها، اتصال دیتابیس لازم است.";

const MESSAGES = {
  invalidCredentials: "ایمیل یا گذرواژه درست نیست",
  emailInUse: "این ایمیل قبلاً ثبت شده است",
  weakPassword: "گذرواژه باید حداقل ۶ نویسه باشد",
  emailNotConfirmed: "برای فعال‌سازی حساب، ایمیل خود را تأیید کنید",
  rateLimited: "تلاش‌های بیش از حد؛ کمی بعد دوباره امتحان کنید",
  network: "ارتباط با سرور برقرار نشد؛ دوباره تلاش کنید",
  unknown: "خطایی رخ داد؛ دوباره تلاش کنید",
  signedOut: "برای ادامه باید وارد شوید",
} as const;

/** Map a Supabase auth error onto an honest, non-technical Persian message. */
function authErrorMessage(error: unknown): string {
  const message =
    typeof (error as { message?: unknown })?.message === "string"
      ? ((error as { message: string }).message.toLowerCase())
      : "";
  const code = (error as { code?: unknown })?.code;
  if (code === "invalid_credentials" || message.includes("invalid login")) {
    return MESSAGES.invalidCredentials;
  }
  if (code === "user_already_exists" || message.includes("already registered")) {
    return MESSAGES.emailInUse;
  }
  if (code === "weak_password" || message.includes("password should be")) {
    return MESSAGES.weakPassword;
  }
  if (code === "email_not_confirmed" || message.includes("not confirmed")) {
    return MESSAGES.emailNotConfirmed;
  }
  if (code === "over_request_rate_limit" || message.includes("rate limit")) {
    return MESSAGES.rateLimited;
  }
  if (message.includes("failed to fetch") || message.includes("network")) {
    return MESSAGES.network;
  }
  return MESSAGES.unknown;
}

/* ── Data access (RLS-protected; never called without a session) ───────────── */

interface ProfileRow {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  created_at: string | null;
  updated_at: string | null;
}

function mapProfile(row: ProfileRow): CustomerProfile {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    email: row.email,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const PROFILE_COLUMNS = "id, name, phone, email, created_at, updated_at";

/** Read the signed-in customer's own profile row (null when it does not exist). */
async function fetchProfile(
  client: SupabaseClient,
  userId: string
): Promise<CustomerProfile | null> {
  const { data, error } = await client
    .from("customer_profiles")
    .select(PROFILE_COLUMNS)
    .eq("id", userId)
    .maybeSingle();
  if (error || !data) return null;
  return mapProfile(data as unknown as ProfileRow);
}

/**
 * Make sure a profile row exists for this user. The DB trigger normally did it
 * at sign-up; this covers a project whose migrations ran later, or a manual user
 * created in the dashboard — the account area must not depend on trigger timing.
 */
async function ensureProfile(
  client: SupabaseClient,
  user: User,
  fallbackName?: string
): Promise<CustomerProfile | null> {
  const existing = await fetchProfile(client, user.id);
  if (existing) return existing;

  const metadata = (user.user_metadata ?? {}) as Record<string, unknown>;
  const name = [fallbackName, metadata.name, metadata.full_name, user.email]
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .find((value) => value !== "");
  const phone = typeof metadata.phone === "string" ? metadata.phone.trim() : "";

  const { data, error } = await client
    .from("customer_profiles")
    .insert({
      id: user.id,
      name: name || "کاربر",
      phone: phone === "" ? null : phone,
      email: user.email ?? null,
    })
    .select(PROFILE_COLUMNS)
    .single();
  if (error || !data) return null;
  return mapProfile(data as unknown as ProfileRow);
}

/* ── Provider ──────────────────────────────────────────────────────────────── */

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  // Always start as "loading": SSR and the first client render agree, so nothing
  // flashes — the account pages show their skeleton until the session is known.
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const loadProfile = useCallback(async (nextUser: User, fallbackName?: string) => {
    // Imported lazily so the client is never created during SSR rendering.
    const { getSupabaseClient } = await import("~/lib/supabase");
    const client = getSupabaseClient();
    if (!client) return;
    setProfileLoading(true);
    try {
      const loaded = await ensureProfile(client, nextUser, fallbackName);
      if (mounted.current) setProfile(loaded);
    } finally {
      if (mounted.current) setProfileLoading(false);
    }
  }, []);

  // Restore the session once, after mount, and follow every later auth change
  // (sign-in, sign-out, token refresh, another tab). Never during SSR.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!isSupabaseConfigured()) {
      setStatus("unconfigured");
      return;
    }

    let active = true;
    let unsubscribe: (() => void) | undefined;

    void (async () => {
      const { getSupabaseClient } = await import("~/lib/supabase");
      const client = getSupabaseClient();
      if (!client) {
        if (active) setStatus("unconfigured");
        return;
      }

      const { data } = await client.auth.getSession();
      const session = data.session ?? null;
      if (!active) return;
      setUser(session?.user ?? null);
      setStatus(session ? "signedIn" : "signedOut");
      if (session?.user) void loadProfile(session.user);

      const listener = client.auth.onAuthStateChange((_event, nextSession) => {
        if (!active) return;
        setUser(nextSession?.user ?? null);
        setStatus(nextSession ? "signedIn" : "signedOut");
        if (nextSession?.user) {
          void loadProfile(nextSession.user);
        } else {
          // Signing out must clear the cached profile immediately (no stale name).
          setProfile(null);
        }
      });
      unsubscribe = () => listener.data.subscription.unsubscribe();
    })();

    return () => {
      active = false;
      unsubscribe?.();
    };
  }, [loadProfile]);

  const signIn = useCallback(
    async (email: string, password: string): Promise<AuthResult> => {
      const { getSupabaseClient } = await import("~/lib/supabase");
      const client = getSupabaseClient();
      if (!client) return { ok: false, message: AUTH_CONFIG_MESSAGE };
      const { data, error } = await client.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error || !data.user) return { ok: false, message: authErrorMessage(error) };
      // `onAuthStateChange` also fires, but loading here makes the account page
      // complete as soon as the form resolves.
      await loadProfile(data.user);
      return { ok: true };
    },
    [loadProfile]
  );

  const signUp = useCallback(
    async ({ email, password, name, phone }: RegisterInput): Promise<AuthResult> => {
      const { getSupabaseClient } = await import("~/lib/supabase");
      const client = getSupabaseClient();
      if (!client) return { ok: false, message: AUTH_CONFIG_MESSAGE };
      const { data, error } = await client.auth.signUp({
        email: email.trim(),
        password,
        // The trigger reads these to build the profile row.
        options: { data: { name: name.trim(), ...(phone ? { phone: phone.trim() } : {}) } },
      });
      if (error) return { ok: false, message: authErrorMessage(error) };

      // With email confirmation ON there is no session yet — say so honestly
      // instead of pretending the customer is signed in.
      if (!data.session) {
        return { ok: true, message: MESSAGES.emailNotConfirmed };
      }
      if (data.user) await loadProfile(data.user, name);
      return { ok: true };
    },
    [loadProfile]
  );

  const signOut = useCallback(async (): Promise<AuthResult> => {
    const { getSupabaseClient } = await import("~/lib/supabase");
    const client = getSupabaseClient();
    if (!client) return { ok: false, message: AUTH_CONFIG_MESSAGE };
    const { error } = await client.auth.signOut();
    if (error) return { ok: false, message: authErrorMessage(error) };
    setProfile(null);
    setStatus("signedOut");
    return { ok: true };
  }, []);

  const refreshProfile = useCallback(async () => {
    if (!user) return;
    await loadProfile(user);
  }, [loadProfile, user]);

  const updateProfile = useCallback(
    async (input: ProfileInput): Promise<AuthResult> => {
      const { getSupabaseClient } = await import("~/lib/supabase");
      const client = getSupabaseClient();
      if (!client) return { ok: false, message: AUTH_CONFIG_MESSAGE };
      if (!user) return { ok: false, message: MESSAGES.signedOut };

      const name = input.name.trim();
      if (name === "") return { ok: false, message: "نام خود را وارد کنید" };
      const phone = (input.phone ?? "").trim();
      const email = (input.email ?? "").trim();

      // 1) The profile row (name/phone/email). RLS: auth.uid() = id.
      const { data, error } = await client
        .from("customer_profiles")
        .upsert(
          {
            id: user.id,
            name,
            phone: phone === "" ? null : phone,
            email: email === "" ? user.email ?? null : email,
          },
          { onConflict: "id" }
        )
        .select(PROFILE_COLUMNS)
        .single();
      if (error || !data) return { ok: false, message: authErrorMessage(error) };
      setProfile(mapProfile(data as unknown as ProfileRow));

      // 2) The Auth email itself (only when it actually changed). A change may
      //    need confirmation in the customer's inbox — report that honestly.
      if (email !== "" && email !== (user.email ?? "")) {
        const { error: emailError } = await client.auth.updateUser({ email });
        if (emailError) return { ok: false, message: authErrorMessage(emailError) };
      }
      return { ok: true };
    },
    [user]
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      profile,
      status,
      profileLoading,
      signIn,
      signUp,
      signOut,
      refreshProfile,
      updateProfile,
    }),
    [user, profile, status, profileLoading, signIn, signUp, signOut, refreshProfile, updateProfile]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/** Customer auth state. Throws when used outside <AuthProvider>. */
export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside <AuthProvider>");
  return context;
}
