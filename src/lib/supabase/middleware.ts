import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isSupabaseConfigured, publicEnv } from "@/lib/env";

const PUBLIC_CRM_PATHS = [
  "/crm/login",
  "/crm/forgot-password",
  "/crm/auth",
];

export function isPublicCrmPath(pathname: string) {
  return PUBLIC_CRM_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/** Refreshes the Supabase session cookie and guards /crm routes. */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const { pathname } = request.nextUrl;

  if (!isSupabaseConfigured()) {
    return response;
  }

  const supabase = createServerClient(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (pathname.startsWith("/crm") && !isPublicCrmPath(pathname) && !user) {
    const url = request.nextUrl.clone();
    url.pathname = "/crm/login";
    url.search = "";
    if (pathname !== "/crm") url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  return response;
}
