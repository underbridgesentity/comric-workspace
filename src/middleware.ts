import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Edge middleware: gate every route behind a session cookie. Full JWT
 * verification happens in the server layout / API routes; this is the
 * fast redirect layer so no unauthenticated request renders app UI.
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Canonical host: send the default production alias to the branded
  // domain (pages only - API/cron clients must not be redirected).
  const host = request.headers.get("host") ?? "";
  if (host === "comric-workspace.vercel.app" && !pathname.startsWith("/api")) {
    const url = new URL(request.url);
    url.host = "www.comricworkspace.co.za";
    url.port = "";
    return NextResponse.redirect(url, 308);
  }

  const isPublic =
    pathname.startsWith("/login") ||
    pathname.startsWith("/onboard") ||
    pathname.startsWith("/api/onboard") ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/api/cron") ||
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico" ||
    pathname.startsWith("/logo") ||
    pathname.startsWith("/photography");

  const hasSession =
    request.cookies.has("authjs.session-token") ||
    request.cookies.has("__Secure-authjs.session-token");

  if (!isPublic && !hasSession) {
    const url = new URL("/login", request.url);
    return NextResponse.redirect(url);
  }

  if (pathname === "/login" && hasSession) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  if (pathname === "/") {
    return NextResponse.redirect(new URL(hasSession ? "/dashboard" : "/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
