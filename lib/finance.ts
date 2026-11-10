import { NextResponse } from "next/server";
import type { Session } from "@/lib/auth/jwt";

/**
 * Which productions a finance user may see.
 *   managerId === null  -> everything (admin)
 *   managerId === n     -> only productions where manager_id = n
 * Returns null (deny) if the session carries no usable user id.
 * The session carries the user id as uid
 */
export function scopeFor(session: Session): { managerId: number | null } | null {
  if (session.role === "ADMIN") return { managerId: null };
  const id = session.uid;
  return Number.isInteger(id) && id > 0 ? { managerId: id } : null;
}

/** Turn a Postgres error into an HTTP response. Trigger/function RAISE EXCEPTION (P0001) is shown to the user. */
export function dbError(err: unknown) {
  const e = err as { code?: string; message?: string };
  if (e.code === "P0001") return NextResponse.json({ error: e.message }, { status: 409 });
  if (e.code === "23514" || e.code === "23503" || e.code === "22P02" || e.code === "22003") {
    return NextResponse.json({ error: "The database rejected that value." }, { status: 400 });
  }
  console.error(err);
  return NextResponse.json({ error: "Unexpected server error." }, { status: 500 });
}
