/**
 * Store identity foundation (white-label).
 *
 * Prefers the store's own `store_settings` row via Supabase when a project is
 * connected; otherwise falls back to neutral placeholders. There is NO settings
 * editing UI in this step — this is read-only plumbing for Header/Footer/etc.
 */

import { useEffect, useState } from "react";

import { getSupabaseClient, isSupabaseConfigured } from "~/lib/supabase";

export interface StoreSettings {
  storeName: string;
  footerText: string;
  phone: string | null;
  email: string | null;
  instagramUrl: string | null;
  telegramUrl: string | null;
  logoUrl: string | null;
  faviconUrl: string | null;
}

/** Neutral placeholders — used until a client's settings row exists. */
export const DEFAULT_STORE_SETTINGS: StoreSettings = {
  storeName: "فروشگاه پوشاک",
  footerText:
    "فروشگاه اینترنتی پوشاک؛ مجموعه‌ای ساده، باکیفیت و مینیمال برای استایل روزمره شما.",
  phone: null,
  email: null,
  instagramUrl: null,
  telegramUrl: null,
  logoUrl: null,
  faviconUrl: null,
};

interface StoreSettingsRow {
  store_name: string | null;
  logo_url: string | null;
  favicon_url: string | null;
  phone: string | null;
  email: string | null;
  instagram_url: string | null;
  telegram_url: string | null;
  footer_text: string | null;
}

/** Loads settings: Supabase row when configured, else the neutral defaults. */
export async function loadStoreSettings(): Promise<StoreSettings> {
  if (isSupabaseConfigured()) {
    // ── Supabase branch ──
    const client = getSupabaseClient();
    if (client) {
      const { data, error } = await client
        .from("store_settings")
        .select("store_name, logo_url, favicon_url, phone, email, instagram_url, telegram_url, footer_text")
        .limit(1)
        .maybeSingle();
      if (!error && data) {
        const row = data as unknown as StoreSettingsRow;
        return {
          storeName: row.store_name?.trim() || DEFAULT_STORE_SETTINGS.storeName,
          footerText: row.footer_text?.trim() || DEFAULT_STORE_SETTINGS.footerText,
          phone: row.phone,
          email: row.email,
          instagramUrl: row.instagram_url,
          telegramUrl: row.telegram_url,
          logoUrl: row.logo_url,
          faviconUrl: row.favicon_url,
        };
      }
    }
  }
  // ── Placeholder branch (no project connected, or no row yet) ──
  return DEFAULT_STORE_SETTINGS;
}

/** Hook for components: neutral placeholders on first paint, Supabase row if any. */
export function useStoreSettings(): StoreSettings {
  const [settings, setSettings] = useState<StoreSettings>(DEFAULT_STORE_SETTINGS);
  useEffect(() => {
    let live = true;
    loadStoreSettings()
      .then((s) => {
        if (live) setSettings(s);
      })
      .catch(() => {
        /* stay on placeholders */
      });
    return () => {
      live = false;
    };
  }, []);
  return settings;
}