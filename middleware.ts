import { NextRequest, NextResponse } from "next/server";
import { COOKIE_NAME, verifySession } from "@/lib/auth/jwt";
import { rolesForPath } from "@/lib/auth/roles";

// Pages only. API routes are protected per-route with withAuth().
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const session = await verifySession(req.cookies.get(COOKIE_NAME)?.value);

  if (pathname === "/login") {
    return session ? NextResponse.redirect(new URL("/dashboard", req.url)) : NextResponse.next();
  }
  if (!session) return NextResponse.redirect(new URL("/login", req.url));

  const allowed = rolesForPath(pathname);
  if (!allowed || !allowed.includes(session.role)) {
    return NextResponse.redirect(new URL("/dashboard?denied=1", req.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|woff2?)$).*)",
  ],
};