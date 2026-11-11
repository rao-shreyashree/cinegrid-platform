import { NextResponse } from "next/server";
import { z } from "zod";
import { query } from "@/lib/db";
import { withAuth } from "@/lib/auth/session";
import { dbError, readBody } from "@/lib/http";

const TYPES = ["equipment_damage", "location_damage", "safety", "operational"] as const;
const STATUSES = ["OPEN", "IN_PROGRESS", "RESOLVED"];

// GET /api/incidents?status=open|OPEN|IN_PROGRESS|RESOLVED&type=safety   (any logged-in user)
// status=open means "not resolved".
export const GET = withAuth(null, async (req) => {
  const sp = req.nextUrl.searchParams;
  const status = sp.get("status");
  const type = sp.get("type");
  if (status && status !== "open" && !STATUSES.includes(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }
  if (type && !(TYPES as readonly string[]).includes(type)) {
    return NextResponse.json({ error: "Invalid type" }, { status: 400 });
  }
  try {
    const incidents = await query(
      `SELECT i.incident_id, i.type, i.status, i.description, i.resolution_notes,
              e.name AS equipment, l.name AS location, u.name AS reported_by,
              to_char(i.reported_at, 'YYYY-MM-DD HH24:MI') AS reported_at,
              to_char(i.resolved_at, 'YYYY-MM-DD HH24:MI') AS resolved_at
         FROM incident i
         LEFT JOIN equipment e ON e.equipment_id = i.equipment_id
         LEFT JOIN location  l ON l.location_id  = i.location_id
         LEFT JOIN users     u ON u.user_id      = i.reported_by
        WHERE ($1::text IS NULL OR ($1 = 'open' AND i.status <> 'RESOLVED') OR i.status = $1)
          AND ($2::text IS NULL OR i.type = $2)
        ORDER BY (i.status = 'RESOLVED'), i.reported_at DESC
        LIMIT 500`,
      [status, type]
    );
    return NextResponse.json({ incidents });
  } catch (err) {
    return dbError(err);
  }
});

const Create = z
  .object({
    type: z.enum(TYPES),
    equipment_id: z.number().int().positive().nullable().optional(),
    location_id: z.number().int().positive().nullable().optional(),
    description: z.string().trim().min(1).max(2000),
  })
  .refine((b) => b.type !== "equipment_damage" || !!b.equipment_id, {
    message: "equipment_id is required for equipment damage",
    path: ["equipment_id"],
  })
  .refine((b) => b.type !== "location_damage" || !!b.location_id, {
    message: "location_id is required for location damage",
    path: ["location_id"],
  });

// POST /api/incidents   anyone logged in can report (crew on set included)
// A damage report puts the equipment/location into MAINTENANCE through the DB trigger.
export const POST = withAuth(null, async (req, session) => {
  const body = await readBody(req, Create);
  if (!body.ok) return body.error;
  const b = body.data;
  try {
    const [row] = await query<{ incident_id: number }>(
      `INSERT INTO incident (type, equipment_id, location_id, reported_by, description)
       VALUES ($1, $2, $3, $4, $5) RETURNING incident_id`,
      [b.type, b.equipment_id ?? null, b.location_id ?? null, session.uid, b.description]
    );
    return NextResponse.json({ incident_id: row.incident_id }, { status: 201 });
  } catch (err) {
    return dbError(err);
  }
});
