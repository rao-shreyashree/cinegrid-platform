import { NextResponse } from "next/server";
import { z } from "zod";
import { withTransaction } from "@/lib/db";
import { withAuth } from "@/lib/auth/session";
import { dbError, parseId, readBody } from "@/lib/http";

// PLANNED is not a valid target: nothing ever moves back to it.
const Body = z.object({ status: z.enum(["CONFIRMED", "IN_PROGRESS", "COMPLETED", "CANCELLED"]) });

// Allowed status changes. CANCELLED and COMPLETED are terminal.
// (Un-cancelling is not allowed: the DB trigger already cancelled the equipment bookings, so the shoot would come back without its equipment.)
const NEXT: Record<string, string[]> = {
  PLANNED: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["IN_PROGRESS", "COMPLETED", "CANCELLED"],
  IN_PROGRESS: ["COMPLETED", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
};

// PATCH /api/bookings/12   change a booking's status (admin: any; production manager: only on their own productions)
// CANCELLED: the DB trigger cancels its equipment bookings; the scene goes back to PLANNED if nothing else is scheduled.
// COMPLETED: the scene becomes SHOT.
// There is no reschedule: the charge is computed from the hours when booked, so cancel and rebook instead.
export const PATCH = withAuth(["ADMIN", "PRODUCTION_MANAGER"], async (req, session, ctx) => {
  const id = parseId((await ctx.params).scheduleId);
  if (!id) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  const body = await readBody(req, Body);
  if (!body.ok) return body.error;
  const { status } = body.data;
  try {
    const result = await withTransaction(async (client) => {
      // One query: ownership check + row lock + current status
      const cur = await client.query<{ scene_id: number; status: string }>(
        `SELECT ss.scene_id, ss.status
           FROM shooting_schedule ss
           JOIN scene s ON s.scene_id = ss.scene_id
           JOIN production p ON p.production_id = s.production_id
          WHERE ss.schedule_id = $1 AND ($2::boolean OR p.manager_id = $3)
            FOR UPDATE OF ss`,
        [id, session.role === "ADMIN", session.uid]
      );
      if (cur.rows.length === 0) return { kind: "notfound" } as const;

      const { scene_id: sceneId, status: from } = cur.rows[0];
      const allowed = NEXT[from] ?? [];
      if (!allowed.includes(status)) return { kind: "bad", from, allowed } as const;

      await client.query("UPDATE shooting_schedule SET status = $2 WHERE schedule_id = $1", [id, status]);
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
      return { kind: "ok" } as const;
    });

    if (result.kind === "notfound") {
      return NextResponse.json({ error: "Booking not found, or you are not the manager of this production" }, { status: 404 });
    }
    if (result.kind === "bad") {
      const msg = result.allowed.length
        ? `A ${result.from} booking can only become: ${result.allowed.join(", ")}`
        : `A ${result.from} booking cannot be changed`;
      return NextResponse.json({ error: msg }, { status: 422 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return dbError(err);
  }
});
