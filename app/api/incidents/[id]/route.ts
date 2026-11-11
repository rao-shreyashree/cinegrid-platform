import { NextResponse } from "next/server";
import { z } from "zod";
import { query } from "@/lib/db";
import { withAuth } from "@/lib/auth/session";
import { dbError, parseId, readBody } from "@/lib/http";

const Body = z.object({
  status: z.enum(["IN_PROGRESS", "RESOLVED"]),
  resolution_notes: z.string().trim().max(2000).optional(),
});

// PATCH /api/incidents/5   move an incident along (admin, production manager)
// RESOLVED: the DB trigger stamps resolved_at and puts the equipment/location back to AVAILABLE
// (only if no other open damage incident remains on it).
export const PATCH = withAuth(["ADMIN", "PRODUCTION_MANAGER"], async (req, _session, ctx) => {
  const id = parseId((await ctx.params).id);
  if (!id) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  const body = await readBody(req, Body);
  if (!body.ok) return body.error;
  const b = body.data;
  try {
    const rows = await query(
      `UPDATE incident SET status = $2, resolution_notes = COALESCE($3, resolution_notes)
        WHERE incident_id = $1 RETURNING incident_id`,
      [id, b.status, b.resolution_notes ?? null]
    );
    if (rows.length === 0) return NextResponse.json({ error: "Incident not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return dbError(err);
  }
});
