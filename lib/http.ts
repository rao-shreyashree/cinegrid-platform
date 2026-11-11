import { NextRequest, NextResponse } from "next/server";
import type { z } from "zod";

export const DATE = /^\d{4}-\d{2}-\d{2}$/;            // 2026-11-12
export const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;       // 09:30 (IST wall-clock, no overnight shoots)

/** Parse + validate a JSON body. Returns { ok: true, data } or { ok: false, error } (a ready-made 400 response). */
export async function readBody<S extends z.ZodType>(req: NextRequest, schema: S) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return {
      ok: false as const,
      error: NextResponse.json(
        {
          error: "Invalid request",
          issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
        },
        { status: 400 }
      ),
    };
  }
  return { ok: true as const, data: parsed.data as z.output<S> };
}

/** "12" -> 12, anything else -> null. */
export function parseId(raw: string | undefined): number | null {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/**
 * Turn a Postgres error into an HTTP response.
 * book_location / book_equipment and the triggers use RAISE EXCEPTION (code P0001) with a readable message.
 */
export function dbError(err: unknown) {
  const e = err as { code?: string; message?: string };
  switch (e?.code) {
    case "P0001": {
      const msg = e.message ?? "Request rejected";
      return NextResponse.json({ error: msg }, { status: msg.startsWith("Resource conflict") ? 409 : 422 });
    }
    case "23P01": // exclusion violation (direct insert that bypassed the functions)
    case "23505": // unique violation
      return NextResponse.json({ error: "That conflicts with an existing record" }, { status: 409 });
    case "23514": // check violation
      return NextResponse.json({ error: "A value is not allowed (check dates, times and amounts)" }, { status: 400 });
    case "23503": // foreign key violation
      return NextResponse.json({ error: "A referenced record does not exist" }, { status: 400 });
    case "22P02":
    case "22007":
    case "22008":
      return NextResponse.json({ error: "Invalid value" }, { status: 400 });
    default:
      console.error(err);
      return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
