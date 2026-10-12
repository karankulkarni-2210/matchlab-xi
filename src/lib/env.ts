import "server-only";

/** Server-side environment access. Secret values never leave this module except to their API calls. */
export const env = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  supabasePublishableKey:
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  supabaseSecretKey: process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  geminiApiKey: process.env.GEMINI_API_KEY ?? "",
  geminiModel: (process.env.GEMINI_MODEL ?? "gemini-3.8-flash").trim(),
  cricketDataApiKey: process.env.CRICKETDATA_API_KEY ?? "",
};

/** Names-only health report (never values). */
export function envStatus() {
  const flashOk = /flash/i.test(env.geminiModel);
  return {
    supabase: !!env.supabaseUrl && !!env.supabasePublishableKey,
    supabaseSecret: !!env.supabaseSecretKey,
    gemini: !!env.geminiApiKey && flashOk,
    geminiModel: flashOk ? env.geminiModel : `${env.geminiModel} (rejected: not a Flash model)`,
    cricketData: !!env.cricketDataApiKey,
  };
}
