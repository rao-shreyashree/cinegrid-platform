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

// POST /api/bookings/location   book a location for a scene (admin: any scene; production manager: only their own productions)
// Conflicts, closed locations and cost are all handled inside the book_location() DB function.
export const POST = withAuth(["ADMIN", "PRODUCTION_MANAGER"], async (req, session) => {
  const body = await readBody(req, Body);
  if (!body.ok) return body.error;
  const b = body.data;
  try {
    // Ownership + location type check in one lookup (book_location() does not check the type).
    // "Not yours" looks the same as "does not exist": 404.
    const [match] = await query<{ required: string | null; type: string }>(
      `SELECT s.required_location_type AS required, l.type
         FROM scene s
         JOIN production p ON p.production_id = s.production_id
         CROSS JOIN location l
        WHERE s.scene_id = $1 AND l.location_id = $2 AND ($3::boolean OR p.manager_id = $4)`,
      [b.scene_id, b.location_id, session.role === "ADMIN", session.uid]
    );
    if (!match) {
      return NextResponse.json(
        { error: "Scene or location not found, or you are not the manager of this production" },
        { status: 404 }
      );
    }
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
