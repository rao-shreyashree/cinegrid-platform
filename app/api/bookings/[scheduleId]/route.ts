import { NextResponse } from "next/server";
import { z } from "zod";
import { withTransaction } from "@/lib/db";
import { withAuth } from "@/lib/auth/session";
import { dbError, parseId, readBody } from "@/lib/http";

const Body = z.object({ status: z.enum(["PLANNED", "CONFIRMED", "IN_PROGRESS", "COMPLETED", "CANCELLED"]) });

// PATCH /api/bookings/12   change a booking's status (admin, production manager)
// CANCELLED: the DB trigger cancels its equipment bookings; the scene goes back to PLANNED if nothing else is scheduled.
// COMPLETED: the scene becomes SHOT.
// There is no reschedule: the charge is computed from the hours when booked, so cancel and rebook instead.
export const PATCH = withAuth(["ADMIN", "PRODUCTION_MANAGER"], async (req, _session, ctx) => {
  const id = parseId((await ctx.params).scheduleId);
  if (!id) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  const body = await readBody(req, Body);
  if (!body.ok) return body.error;
  const { status } = body.data;
  try {
    const found = await withTransaction(async (client) => {
      const upd = await client.query<{ scene_id: number }>(
        "UPDATE shooting_schedule SET status = $2 WHERE schedule_id = $1 RETURNING scene_id",
        [id, status]
      );
      if (upd.rows.length === 0) return false;
      const sceneId = upd.rows[0].scene_id;
      if (status === "COMPLETED") {
        await client.query("UPDATE scene SET status = 'SHOT' WHERE scene_id = $1", [sceneId]);
      } else if (status === "CANCELLED") {
        await client.query(
          `UPDATE scene SET status = 'PLANNED'
            WHERE scene_id = $1 AND status = 'SCHEDULED'
              AND NOT EXISTS (SELECT 1 FROM shooting_schedule WHERE scene_id = $1 AND status <> 'CANCELLED')`,
          [sceneId]
        );
      }
      return true;
    });
    if (!found) return NextResponse.json({ error: "Booking not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return dbError(err);
  }
});
