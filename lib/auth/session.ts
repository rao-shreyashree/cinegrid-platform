import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { COOKIE_NAME, Session, verifySession } from "./jwt";
import type { Role } from "./roles";

/** Current logged-in user (server components / route handlers), or null. */
export async function getSession(): Promise<Session | null> {
  const store = await cookies();
  return verifySession(store.get(COOKIE_NAME)?.value);
}

type Handler = (req: NextRequest, session: Session, ctx: any) => Promise<Response> | Response; // eslint-disable-line @typescript-eslint/no-explicit-any

/**
 * Wrap an API route handler with authentication + role check.
 *   export const GET = withAuth(["ADMIN"], async (req, session) => NextResponse.json({...}));
 *   export const GET = withAuth(null, ...)  // any logged-in user
 * Middleware does NOT protect /api, so every API route must use this.
 */
export function withAuth(roles: Role[] | null, handler: Handler) {
  return async (req: NextRequest, ctx: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    if (roles && !roles.includes(session.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return handler(req, session, ctx);
  };
}
