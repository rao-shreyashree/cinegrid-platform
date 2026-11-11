import { NextResponse } from "next/server";
import { z } from "zod";
import { withTransaction } from "@/lib/db";
import { withAuth } from "@/lib/auth/session";
import { dbError, readBody } from "@/lib/http";

const Body = z.object({
  schedule_id: z.number().int().positive(),
  equipment_ids: z.array(z.number().int().positive()).min(1).max(10),
});

// POST /api/bookings/equipment   attach one or more items to a schedule slot (admin, production manager)
// All-or-nothing: if any item is double-booked or in maintenance, NOTHING is booked (transaction rolls back).
export const POST = withAuth(["ADMIN", "PRODUCTION_MANAGER"], async (req) => {
  const body = await readBody(req, Body);
  if (!body.ok) return body.error;
  const b = body.data;
  try {
    const ids = await withTransaction(async (client) => {
      const out: number[] = [];
      for (const equipmentId of new Set(b.equipment_ids)) {
        const r = await client.query<{ id: number }>("SELECT book_equipment($1, $2) AS id", [b.schedule_id, equipmentId]);
        out.push(r.rows[0].id);
      }
      return out;
    });
    return NextResponse.json({ equip_booking_ids: ids }, { status: 201 });
  } catch (err) {
    return dbError(err);
  }
});
