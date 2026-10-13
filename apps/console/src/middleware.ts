import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/auth/session";

/**
 * Everything is private. Pages need a session; /api/agent/* and /api/hooks/*
 * check their own shared secrets in the route handlers.
 */
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (pathname.startsWith("/api/agent/") || pathname.startsWith("/api/hooks/")) return NextResponse.next();
  // CSRF: browser requests that change data must come from this site (server actions get the same check from Next.js).
  if (req.method !== "GET" && req.method !== "HEAD" && pathname.startsWith("/api/")) {
    const origin = req.headers.get("origin");
    if (!origin || new URL(origin).host !== req.headers.get("host")) {
      return NextResponse.json({ message: "Cross-site request blocked" }, { status: 403 });
    }
  }
  if (pathname === "/login" || pathname === "/login/verify") return NextResponse.next();
  const session = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);
  if (session) return NextResponse.next();
  if (pathname.startsWith("/api/")) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname)}`;
  return NextResponse.redirect(url);
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.png|multi-solar-logo.png|images/).*)"] };
