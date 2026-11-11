import { NextRequest, NextResponse } from "next/server";
import type { z } from "zod";

export const VENDOR_TYPES = ["catering", "transport", "security", "costume", "makeup", "vfx", "power", "props", "other"] as const;
export const BOOKING_STATUSES = ["REQUESTED", "CONFIRMED", "COMPLETED", "CANCELLED"] as const;

/** Allowed service booking status changes. COMPLETED and CANCELLED are final. */
export const NEXT_STATUS: Record<string, string[]> = {
  REQUESTED: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["COMPLETED", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
};

export const DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/; // 2026-11-12T09:30 (IST wall-clock)

export function parseId(raw: string | null | undefined): number | null {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export async function readBody<S extends z.ZodType>(req: NextRequest, schema: S) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return {
      ok: false as const,
      error: NextResponse.json(
        { error: "Invalid request", issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })) },
        { status: 400 }
      ),
    };
  }
  return { ok: true as const, data: parsed.data as z.output<S> };
}

/** Postgres error -> HTTP response. RAISE EXCEPTION messages from triggers are readable, so they pass through. */
export function dbFail(err: unknown) {
  const e = err as { code?: string; message?: string };
  switch (e?.code) {
    case "P0001": return NextResponse.json({ error: e.message ?? "Request rejected" }, { status: 422 });
    case "23505": return NextResponse.json({ error: "That conflicts with an existing record" }, { status: 409 });
    case "23514": return NextResponse.json({ error: "A value is not allowed (check times and amounts)" }, { status: 400 });
    case "23503": return NextResponse.json({ error: "A referenced record does not exist" }, { status: 400 });
    case "22P02": case "22007": case "22008": return NextResponse.json({ error: "Invalid value" }, { status: 400 });
    default:
      console.error(err);
      return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
