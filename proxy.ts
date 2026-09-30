/**
 * Proxy (the file Next.js 16 uses in place of "middleware.ts").
 *
 * Runs before every matched request and enforces:
 *   public  → /, /apply/*, /api/apply, /api/jobs, /login, /api/login
 *   admin   → everything else (valid session cookie required)
 *   cron    → POST /api/screen may also use the x-cron-secret header
 *
 * Route handlers check again with `requireAdmin()` (defense in depth).
 */
import { NextResponse, type NextRequest } from "next/server";
import { hasCronSecret, SESSION_COOKIE, verifySessionToken } from "./lib/auth";

const PUBLIC_PATHS = [/^\/$/, /^\/apply(\/.*)?$/, /^\/api\/apply$/, /^\/api\/jobs$/, /^\/login$/, /^\/api\/login$/];

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (PUBLIC_PATHS.some((re) => re.test(pathname))) return NextResponse.next();
  if (pathname === "/api/screen" && hasCronSecret(request)) return NextResponse.next();
  if (await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value)) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "ابتدا وارد پنل مدیریت شوید." }, { status: 401 });
  }

  const login = new URL("/login", request.url);
  login.searchParams.set("next", pathname + search);
  return NextResponse.redirect(login);
}

export const config = {
  // Skip Next.js internals and static files so CSS/JS/fonts always load.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|webp|ico|woff2?)$).*)"],
};
