// Edge-safe (used by middleware): only depends on `jose`.
import { SignJWT, jwtVerify } from "jose";
import type { Role } from "./roles";

export const COOKIE_NAME = "cinegrid_session";
export const SESSION_HOURS = 8;

export type Session = { uid: number; name: string; email: string; role: Role };

function secret() {
  const s = process.env.JWT_SECRET;
  if (!s || s.length < 32) throw new Error("JWT_SECRET missing or too short (min 32 chars)");
  return new TextEncoder().encode(s);
}

export async function signSession(s: Session): Promise<string> {
  return new SignJWT({ ...s })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_HOURS}h`)
    .sign(secret());
}

export async function verifySession(token: string | undefined): Promise<Session | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: ["HS256"] });
    return { uid: payload.uid as number, name: payload.name as string, email: payload.email as string, role: payload.role as Role };
  } catch {
    return null;
  }
}
