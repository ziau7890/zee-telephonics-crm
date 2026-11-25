/**
 * Central place for environment configuration. Server-only secrets are read
 * lazily inside server code and never exported to the browser.
 */
export const publicEnv = {
  /** Where the CRM is hosted, e.g. https://crm.zeetelephonicsbpo.com. Used in email links. */
  siteUrl: (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, ""),
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
};

export function isSupabaseConfigured() {
  return Boolean(publicEnv.supabaseUrl && publicEnv.supabaseAnonKey);
}

/** Company email domains allowed to hold CRM accounts, e.g. "zeetelephonicsbpo.com". */
export function allowedEmailDomains(): string[] {
  return (process.env.COMPANY_EMAIL_DOMAINS ?? "")
    .split(",")
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);
}
