import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, adminConfigured, verifySession } from "@/lib/admin/session";

/**
 * Gate for the private admin area. Missing admin env → 404 (fail closed).
 * Signed-out page requests go to /admin/login; signed-out API calls get 401.
 * Every admin page, action and route checks the session again itself.
 */
export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (!adminConfigured()) return new NextResponse("Not found", { status: 404 });

  const noindex = (res: NextResponse) => {
    res.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
    res.headers.set("Cache-Control", "private, no-store");
    return res;
  };
  if (pathname === "/admin/login") return noindex(NextResponse.next());

  const email = verifySession(req.cookies.get(SESSION_COOKIE)?.value);
  if (email) return noindex(NextResponse.next());
  if (pathname.startsWith("/api/")) {
    return noindex(NextResponse.json({ error: "unauthorized" }, { status: 401 }));
  }
  return noindex(NextResponse.redirect(new URL("/admin/login", req.url)));
}

export const config = {
  matcher: ["/admin", "/admin/:path*", "/api/admin/:path*"],
};
