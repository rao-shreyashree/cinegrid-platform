import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { withAuth } from "@/lib/auth/session";
import { dbError, parseId } from "@/lib/http";

const SCENE_STATUSES = ["PLANNED", "SCHEDULED", "SHOT", "CANCELLED"];

// GET /api/scenes?production_id=3&status=PLANNED   (booking page: which scenes still need a slot)
export const GET = withAuth(["ADMIN", "PRODUCTION_MANAGER"], async (req) => {
  const sp = req.nextUrl.searchParams;
  const pidRaw = sp.get("production_id");
  const pid = pidRaw ? parseId(pidRaw) : null;
  if (pidRaw && !pid) return NextResponse.json({ error: "Invalid production_id" }, { status: 400 });
  const status = sp.get("status");
  if (status && !SCENE_STATUSES.includes(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }
  try {
    const scenes = await query(
      `SELECT s.scene_id, s.production_id, p.title AS production, s.scene_number, s.description,
              s.required_location_type, s.planned_duration, s.priority, s.status
         FROM scene s JOIN production p ON p.production_id = s.production_id
        WHERE ($1::int IS NULL OR s.production_id = $1) AND ($2::text IS NULL OR s.status = $2)
        ORDER BY p.title, s.scene_number
        LIMIT 500`,
      [pid, status]
    );
    return NextResponse.json({ scenes });
  } catch (err) {
    return dbError(err);
  }
});
