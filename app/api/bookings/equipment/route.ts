import { NextResponse } from "next/server";
import { z } from "zod";
import { withTransaction } from "@/lib/db";
import { withAuth } from "@/lib/auth/session";
import { dbError, readBody } from "@/lib/http";

const Body = z.object({
  schedule_id: z.number().int().positive(),
  equipment_ids: z.array(z.number().int().positive()).min(1).max(10),
});

// POST /api/bookings/equipment   attach one or more items to a schedule slot
// (admin: any schedule; production manager: only schedules of their own productions)
// All-or-nothing: everything runs in ONE transaction, so if any item is double-booked or in maintenance,
// NOTHING is booked. The schedule row itself is created by the separate location booking request and is not touched here.
export const POST = withAuth(["ADMIN", "PRODUCTION_MANAGER"], async (req, session) => {
  const body = await readBody(req, Body);
  if (!body.ok) return body.error;
  const b = body.data;
  try {
    const ids = await withTransaction(async (client) => {
      // Ownership check + lock the schedule row (also keeps a concurrent cancel from slipping in between).
      const own = await client.query(
        `SELECT 1
           FROM shooting_schedule ss
           JOIN scene s ON s.scene_id = ss.scene_id
           JOIN production p ON p.production_id = s.production_id
          WHERE ss.schedule_id = $1 AND ($2::boolean OR p.manager_id = $3)
            FOR UPDATE OF ss`,
        [b.schedule_id, session.role === "ADMIN", session.uid]
      );
      if (own.rows.length === 0) return null;

      const out: number[] = [];
      for (const equipmentId of new Set(b.equipment_ids)) {
        const r = await client.query<{ id: number }>("SELECT book_equipment($1, $2) AS id", [b.schedule_id, equipmentId]);
        out.push(r.rows[0].id);
      }
      return out;
    });
    if (ids === null) {
      return NextResponse.json(
        { error: "Booking not found, or you are not the manager of this production" },
        { status: 404 }
      );
    }
    return NextResponse.json({ equip_booking_ids: ids }, { status: 201 });
  } catch (err) {
    return dbError(err);
  }
});
