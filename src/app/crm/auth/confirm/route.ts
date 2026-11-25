import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeNextPath } from "@/lib/validation";

const DEFAULT_NEXT: Partial<Record<EmailOtpType, string>> = {
  invite: "/crm/activate",
  recovery: "/crm/reset-password",
  signup: "/crm/activate",
};

/** Token-hash confirmation used by invitation, recovery and email-change emails. */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  if (tokenHash && type) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) {
      const next = searchParams.get("next") ? safeNextPath(searchParams.get("next")) : DEFAULT_NEXT[type] ?? "/crm";
      return NextResponse.redirect(`${origin}${next}`);
    }
  }
  return NextResponse.redirect(`${origin}/crm/login?error=link-expired`);
}
