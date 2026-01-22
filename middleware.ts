import { type NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isDevelopmentEnvironment = process.env.NODE_ENV === "development";

  /*
   * Playwright starts the dev server and requires a 200 status to
   * begin the tests, so this ensures that the tests can start
   */
  if (pathname.startsWith("/ping")) {
    return new Response("pong", { status: 200 });
  }

  if (pathname.startsWith("/api/auth")) {
    return NextResponse.next();
  }

  if (process.env.PLAYWRIGHT) {
    const testUserId = request.headers.get("x-test-user-id");
    if (testUserId) {
      return NextResponse.next();
    }
  }

  // Allow cron jobs to bypass authentication (they use CRON_SECRET for auth)
  if (pathname.startsWith("/api/cron")) {
    return NextResponse.next();
  }

  // Allow iOS Shortcut API to bypass session auth (uses its own API key auth)
  if (pathname === "/api/bets/shortcut") {
    return NextResponse.next();
  }

  // Allow login and register pages for unauthenticated users
  if (["/login", "/register"].includes(pathname)) {
    const token = await getToken({
      req: request,
      secret: process.env.AUTH_SECRET,
      secureCookie: !isDevelopmentEnvironment,
    });

    // If already authenticated, redirect away from auth pages
    if (token) {
      return NextResponse.redirect(new URL("/", request.url));
    }

    // Allow unauthenticated access to login/register
    return NextResponse.next();
  }

  const token = await getToken({
    req: request,
    secret: process.env.AUTH_SECRET,
    secureCookie: !isDevelopmentEnvironment,
  });

  if (!token) {
    // For API routes, return 401 instead of redirect
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    // Redirect to login page with callback URL
    const callbackUrl = encodeURIComponent(request.nextUrl.pathname);
    return NextResponse.redirect(
      new URL(`/login?callbackUrl=${callbackUrl}`, request.url)
    );
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/",
    "/chat/:id",
    "/api/:path*",
    "/login",
    "/register",

    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico, sitemap.xml, robots.txt (metadata files)
     */
    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)",
  ],
};
