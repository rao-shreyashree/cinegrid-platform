import { NextResponse } from "next/server";
import { z } from "zod";
import { query } from "@/lib/db";
import { withAuth } from "@/lib/auth/session";
import { DATE, TIME, dbError, readBody } from "@/lib/http";

const Body = z
  .object({
    scene_id: z.number().int().positive(),
    location_id: z.number().int().positive(),
    date: z.string().regex(DATE),
    start: z.string().regex(TIME),
    end: z.string().regex(TIME),
  })
  .refine((b) => b.end > b.start, { message: "End time must be after start time", path: ["end"] });

// POST /api/bookings/location   book a location for a scene (admin, production manager)
// Conflicts, closed locations and cost are all handled inside the book_location() DB function.
export const POST = withAuth(["ADMIN", "PRODUCTION_MANAGER"], async (req) => {
  const body = await readBody(req, Body);
  if (!body.ok) return body.error;
  const b = body.data;
  try {
    // book_location() does not check the location type, so we do it here
    const [match] = await query<{ required: string | null; type: string }>(
      `SELECT s.required_location_type AS required, l.type
         FROM scene s CROSS JOIN location l
        WHERE s.scene_id = $1 AND l.location_id = $2`,
      [b.scene_id, b.location_id]
    );
    if (!match) return NextResponse.json({ error: "Scene or location not found" }, { status: 404 });
    if (match.required && match.required !== match.type) {
      return NextResponse.json({ error: `This scene needs a ${match.required} location` }, { status: 422 });
    }

    const [row] = await query<{ schedule_id: number }>(
      "SELECT book_location($1, $2, $3, $4, $5) AS schedule_id",
      [b.scene_id, b.location_id, b.date, b.start, b.end]
    );
    return NextResponse.json({ schedule_id: row.schedule_id }, { status: 201 });
  } catch (err) {
    return dbError(err);
  }
});
