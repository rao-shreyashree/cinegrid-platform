import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { query } from "@/lib/db";
import { COOKIE_NAME, SESSION_HOURS, signSession } from "@/lib/auth/jwt";
import type { Role } from "@/lib/auth/roles";

const Body = z.object({ email: z.string().email().max(255), password: z.string().min(1).max(200) });

// Compared against when the email doesn't exist, so response time doesn't reveal valid emails.
const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", 10);

export async function POST(req: NextRequest) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid email or password" }, { status: 400 });
  const { email, password } = parsed.data;

  const rows = await query<{ user_id: number; name: string; email: string; password_hash: string; role_name: Role }>(
    `SELECT u.user_id, u.name, u.email, u.password_hash, r.role_name
       FROM users u JOIN role r ON r.role_id = u.role_id
      WHERE lower(u.email) = lower($1)`,
    [email]
  );
  const user = rows[0];
  const ok = await bcrypt.compare(password, user?.password_hash ?? DUMMY_HASH);
  if (!user || !ok) return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });

  const token = await signSession({ uid: user.user_id, name: user.name, email: user.email, role: user.role_name });
  const res = NextResponse.json({ name: user.name, role: user.role_name });
  res.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_HOURS * 3600,
  });
  return res;
}
