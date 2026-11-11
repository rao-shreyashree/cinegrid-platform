import { NextResponse } from "next/server";
import { z } from "zod";
import { query } from "@/lib/db";
import { withAuth } from "@/lib/auth/session";
import { embed, toVector } from "@/lib/embed";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

const Body = z
  .object({
    query: z.string().trim().min(3).max(300),
    kind: z.enum(["location", "equipment", "scene"]),
    type: z.enum(["studio", "sound_stage", "outdoor", "backlot", "set"]).optional(), // locations only
    date: z.string().regex(DATE).optional(),
    from: z.string().regex(TIME).optional(),
    to: z.string().regex(TIME).optional(),
    limit: z.number().int().min(1).max(20).default(8),
  })
  .refine((b) => [b.date, b.from, b.to].every(Boolean) || [b.date, b.from, b.to].every((x) => !x), {
    message: "date, from and to must be given together",
  })
  .refine((b) => !b.from || !b.to || b.to > b.from, { message: "End time must be after start time", path: ["to"] });

// Same overlap rule as the exclusion constraints: during && range, ignoring CANCELLED.
// $2 date, $3 from, $4 to, $5 slot given?
const LOC_AVAILABLE = `(l.status = 'AVAILABLE' AND ($5::boolean = false OR NOT EXISTS (
    SELECT 1 FROM shooting_schedule ss
     WHERE ss.location_id = l.location_id AND ss.status <> 'CANCELLED'
       AND ss.during && tsrange($2::date + $3::time, $2::date + $4::time))))`;
const EQ_AVAILABLE = `(e.status <> 'MAINTENANCE' AND ($5::boolean = false OR NOT EXISTS (
    SELECT 1 FROM equipment_booking eb
     WHERE eb.equipment_id = e.equipment_id AND eb.status <> 'CANCELLED'
       AND eb.during && tsrange($2::date + $3::time, $2::date + $4::time))))`;

/**
 * POST /api/search   hybrid search: pgvector similarity, then relational filters in the same SQL statement.
 *   { query, kind: "location" | "equipment" | "scene", type?, date?, from?, to?, limit? }
 * With a date + slot, only resources free for that slot are returned.
 * Scenes are limited to the manager's own productions (admin sees all).
 */
export const POST = withAuth(["ADMIN", "PRODUCTION_MANAGER"], async (req, session) => {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })) },
      { status: 400 }
    );
  }
  const b = parsed.data;
  const started = Date.now();
  try {
    const vec = toVector(await embed(b.query));
    const hasSlot = Boolean(b.date);
    const slot = [b.date ?? null, b.from ?? null, b.to ?? null, hasSlot];

    let results: unknown[];
    if (b.kind === "location") {
      results = await query(
        `SELECT l.location_id AS id, l.name, l.type, l.capacity, l.status, l.rental_price::float AS rental_price,
                l.description, ROUND((1 - (l.embedding <=> $1::vector))::numeric, 3)::float AS score,
                ${LOC_AVAILABLE} AS available
           FROM location l
          WHERE l.embedding IS NOT NULL AND ($7::text IS NULL OR l.type = $7)
            AND ($5::boolean = false OR ${LOC_AVAILABLE})
          ORDER BY l.embedding <=> $1::vector
          LIMIT $6`,
        [vec, ...slot, b.limit, b.type ?? null]
      );
    } else if (b.kind === "equipment") {
      results = await query(
        `SELECT e.equipment_id AS id, e.name, e.category, e.serial_number, vs.current_status AS status,
                e.rental_price::float AS rental_price, e.description,
                ROUND((1 - (e.embedding <=> $1::vector))::numeric, 3)::float AS score,
                ${EQ_AVAILABLE} AS available
           FROM equipment e JOIN v_equipment_status vs ON vs.equipment_id = e.equipment_id
          WHERE e.embedding IS NOT NULL
            AND ($5::boolean = false OR ${EQ_AVAILABLE})
          ORDER BY e.embedding <=> $1::vector
          LIMIT $6`,
        [vec, ...slot, b.limit]
      );
    } else {
      results = await query(
        `SELECT s.scene_id AS id, s.scene_number, s.description, s.required_location_type, s.status, s.priority,
                p.production_id, p.title AS production,
                ROUND((1 - (s.embedding <=> $1::vector))::numeric, 3)::float AS score
           FROM scene s JOIN production p ON p.production_id = s.production_id
          WHERE s.embedding IS NOT NULL AND s.status <> 'CANCELLED' AND ($3::boolean OR p.manager_id = $4)
          ORDER BY s.embedding <=> $1::vector
          LIMIT $2`,
        [vec, b.limit, session.role === "ADMIN", session.uid]
      );
    }

    if (results.length === 0) {
      const table = b.kind === "location" ? "location" : b.kind === "equipment" ? "equipment" : "scene";
      const [c] = await query<{ n: number }>(`SELECT count(*)::int AS n FROM ${table} WHERE embedding IS NOT NULL`);
      if (c.n === 0) {
        return NextResponse.json(
          { error: "No embeddings yet. Run: node scripts/embed.mjs" },
          { status: 409 }
        );
      }
    }
    return NextResponse.json({ results, took_ms: Date.now() - started });
  } catch (err) {
    console.error("search failed:", err);
    return NextResponse.json({ error: "Search failed" }, { status: 500 });
  }
});
