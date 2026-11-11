import { NextResponse } from "next/server";
import { z } from "zod";
import { query } from "@/lib/db";
import { withAuth } from "@/lib/auth/session";
import { DATE, dbError, parseId, readBody } from "@/lib/http";

const STATUSES = ["PLANNED", "PRE_PRODUCTION", "SHOOTING", "POST_PRODUCTION", "COMPLETED", "CANCELLED"] as const;

// GET /api/productions/12   production + its scenes (with schedule) + cost summary
// Money (budget, charges, cost) is not returned to crew.
export const GET = withAuth(null, async (_req, session, ctx) => {
  const id = parseId((await ctx.params).id);
  if (!id) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  const isCrew = session.role === "CREW";
  try {
    const [production] = await query(
      `SELECT p.production_id, p.title, p.type, p.status,
              p.start_date::text AS start_date, p.planned_end_date::text AS planned_end_date,
              p.budget::float AS budget, p.description,
              ph.name AS production_house, u.name AS manager
         FROM production p
         LEFT JOIN production_house ph ON ph.house_id = p.house_id
         LEFT JOIN users u ON u.user_id = p.manager_id
        WHERE p.production_id = $1`,
      [id]
    );
    if (!production) return NextResponse.json({ error: "Production not found" }, { status: 404 });

    const scenes = await query(
      `SELECT s.scene_id, s.scene_number, s.description, s.required_location_type, s.planned_duration,
              s.priority, s.status,
              ss.schedule_id, l.name AS location, ss.shoot_date::text AS shoot_date,
              to_char(ss.start_time, 'HH24:MI') AS starts_at, to_char(ss.end_time, 'HH24:MI') AS ends_at,
              ss.status AS schedule_status, ss.charge::float AS charge
         FROM scene s
         LEFT JOIN shooting_schedule ss ON ss.scene_id = s.scene_id AND ss.status <> 'CANCELLED'
         LEFT JOIN location l ON l.location_id = ss.location_id
        WHERE s.production_id = $1
        ORDER BY s.scene_number, ss.shoot_date`,
      [id]
    );

    let cost: Record<string, unknown> | null = null;
    if (!isCrew) {
      const [row] = await query(
        `SELECT total_cost::float AS total_cost, invoiced::float AS invoiced,
                paid::float AS paid, outstanding::float AS outstanding
           FROM v_production_cost WHERE production_id = $1`,
        [id]
      );
      cost = row ?? null;
    }

    return NextResponse.json({
      production: isCrew ? { ...production, budget: null } : production,
      scenes: isCrew ? scenes.map((s) => ({ ...s, charge: null })) : scenes,
      cost,
    });
  } catch (err) {
    return dbError(err);
  }
});

const Patch = z
  .object({
    status: z.enum(STATUSES).optional(),
    description: z.string().max(2000).optional(),
    start_date: z.string().regex(DATE).optional(),
    planned_end_date: z.string().regex(DATE).optional(),
    budget: z.number().nonnegative().max(9_999_999_999).optional(),
  })
  .refine((b) => Object.keys(b).length > 0, { message: "Nothing to update" });

// PATCH /api/productions/12   admin: any production; manager: only their own
export const PATCH = withAuth(["ADMIN", "PRODUCTION_MANAGER"], async (req, session, ctx) => {
  const id = parseId((await ctx.params).id);
  if (!id) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  const body = await readBody(req, Patch);
  if (!body.ok) return body.error;
  const b = body.data;
  try {
    const rows = await query(
      `UPDATE production SET
              status           = COALESCE($2, status),
              description      = COALESCE($3, description),
              start_date       = COALESCE($4::date, start_date),
              planned_end_date = COALESCE($5::date, planned_end_date),
              budget           = COALESCE($6::numeric, budget)
        WHERE production_id = $1 AND ($7::boolean OR manager_id = $8)
        RETURNING production_id`,
      [id, b.status ?? null, b.description ?? null, b.start_date ?? null, b.planned_end_date ?? null,
       b.budget ?? null, session.role === "ADMIN", session.uid]
    );
    if (rows.length === 0) {
      return NextResponse.json({ error: "Production not found, or you are not its manager" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return dbError(err);
  }
});
