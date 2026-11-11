import { NextResponse } from "next/server";
import { z } from "zod";
import { query } from "@/lib/db";
import { withAuth } from "@/lib/auth/session";
import { DATE, dbError, readBody } from "@/lib/http";

const STATUSES = ["PLANNED", "PRE_PRODUCTION", "SHOOTING", "POST_PRODUCTION", "COMPLETED", "CANCELLED"] as const;
const TYPES = ["feature_film", "web_series", "tv_series", "ad", "music_video", "short_film"] as const;

// GET /api/productions?status=SHOOTING   (any logged-in user; budget hidden from crew)
export const GET = withAuth(null, async (req, session) => {
  const status = req.nextUrl.searchParams.get("status");
  if (status && !(STATUSES as readonly string[]).includes(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }
  try {
    const rows = await query(
      `SELECT p.production_id, p.title, p.type, p.status,
              p.start_date::text AS start_date, p.planned_end_date::text AS planned_end_date,
              p.budget::float AS budget, p.description,
              ph.name AS production_house, u.name AS manager,
              (SELECT count(*) FROM scene s WHERE s.production_id = p.production_id)::int AS scenes
         FROM production p
         LEFT JOIN production_house ph ON ph.house_id = p.house_id
         LEFT JOIN users u ON u.user_id = p.manager_id
        WHERE ($1::text IS NULL OR p.status = $1)
        ORDER BY p.start_date DESC NULLS LAST, p.title`,
      [status]
    );
    const out = session.role === "CREW" ? rows.map((r) => ({ ...r, budget: null })) : rows;
    return NextResponse.json({ productions: out });
  } catch (err) {
    return dbError(err);
  }
});

const Create = z.object({
  title: z.string().trim().min(1).max(255),
  type: z.enum(TYPES),
  house_id: z.number().int().positive().nullable().optional(),
  manager_id: z.number().int().positive().optional(), // admin only; managers always own what they create
  start_date: z.string().regex(DATE).nullable().optional(),
  planned_end_date: z.string().regex(DATE).nullable().optional(),
  budget: z.number().nonnegative().max(9_999_999_999).nullable().optional(),
  status: z.enum(STATUSES).optional(),
  description: z.string().max(2000).nullable().optional(),
});

// POST /api/productions   (admin, production manager)
export const POST = withAuth(["ADMIN", "PRODUCTION_MANAGER"], async (req, session) => {
  const body = await readBody(req, Create);
  if (!body.ok) return body.error;
  const b = body.data;
  const managerId = session.role === "ADMIN" ? (b.manager_id ?? session.uid) : session.uid;
  try {
    const [row] = await query<{ production_id: number }>(
      `INSERT INTO production (title, type, house_id, manager_id, start_date, planned_end_date, budget, status, description)
       VALUES ($1, $2, $3, $4, $5, $6, $7, COALESCE($8, 'PLANNED'), $9)
       RETURNING production_id`,
      [b.title, b.type, b.house_id ?? null, managerId, b.start_date ?? null, b.planned_end_date ?? null,
       b.budget ?? null, b.status ?? null, b.description ?? null]
    );
    return NextResponse.json({ production_id: row.production_id }, { status: 201 });
  } catch (err) {
    return dbError(err);
  }
});
