import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Placeholders allow `next build` to prerender client pages when `.env.local` is absent. */
const buildFallbackUrl = "https://build-placeholder.supabase.co";
const buildFallbackKey =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";

/** One browser client per tab. Creating a new client every React render breaks Realtime (channels reset each render). */
let browserClient: SupabaseClient | undefined;

export function createClient(): SupabaseClient {
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL || buildFallbackUrl;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || buildFallbackKey;

  if (typeof window !== "undefined") {
    if (!browserClient) {
      browserClient = createBrowserClient(url, key);
    }
    return browserClient;
  }

  return createBrowserClient(url, key);
}
