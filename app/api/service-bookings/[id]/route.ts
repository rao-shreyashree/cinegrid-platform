import { NextResponse } from "next/server";
import { z } from "zod";
import { withTransaction } from "@/lib/db";
import { withAuth } from "@/lib/auth/session";
import { BOOKING_STATUSES, NEXT_STATUS, dbFail, parseId, readBody } from "@/lib/vendors";

const Body = z.object({ status: z.enum(BOOKING_STATUSES) });

// PATCH /api/service-bookings/7   change status
//   admin: any allowed change; manager: cancel only, on their own productions.
//   Allowed: REQUESTED -> CONFIRMED|CANCELLED, CONFIRMED -> COMPLETED|CANCELLED. COMPLETED and CANCELLED are final.
//   An invoiced booking cannot be cancelled (the invoice total would no longer match its items).
export const PATCH = withAuth(["ADMIN", "PRODUCTION_MANAGER"], async (req, session, ctx) => {
  const id = parseId((await ctx.params).id);
  if (!id) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  const body = await readBody(req, Body);
  if (!body.ok) return body.error;
  const next = body.data.status;
  const isAdmin = session.role === "ADMIN";
  if (!isAdmin && next !== "CANCELLED") {
    return NextResponse.json({ error: "Only an admin can confirm or complete a service booking" }, { status: 403 });
  }
  try {
    const out = await withTransaction(async (client) => {
      const cur = await client.query<{ status: string; invoice_id: number | null }>(
        `SELECT sb.status, sb.invoice_id
           FROM service_booking sb JOIN production p ON p.production_id = sb.production_id
          WHERE sb.service_booking_id = $1 AND ($2::boolean OR p.manager_id = $3)
          FOR UPDATE OF sb`,
        [id, isAdmin, session.uid]
      );
      if (cur.rows.length === 0) return { code: 404, error: "Service booking not found" };
      const { status, invoice_id } = cur.rows[0];
      if (!NEXT_STATUS[status]?.includes(next)) return { code: 422, error: `Cannot change a ${status} booking to ${next}` };
      if (next === "CANCELLED" && invoice_id !== null) {
        return { code: 422, error: "This booking is already on an invoice and cannot be cancelled" };
      }
      await client.query("UPDATE service_booking SET status = $2 WHERE service_booking_id = $1", [id, next]);
      return { code: 200 };
    });
    if (out.code !== 200) return NextResponse.json({ error: out.error }, { status: out.code });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return dbFail(err);
  }
});
