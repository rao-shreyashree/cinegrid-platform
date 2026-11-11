import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { withAuth } from "@/lib/auth/session";
import { scopeFor } from "@/lib/finance";
import { LINK, parseKind } from "@/lib/people";

// GET /api/people/scenes?kind=actors|crew&id=N&q=title
// Scenes this person could still be assigned to (own productions only for managers).
export const GET = withAuth(["ADMIN", "PRODUCTION_MANAGER"], async (req, session) => {
  const scope = scopeFor(session);
  if (!scope) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const sp = new URL(req.url).searchParams;
  const kind = parseKind(sp.get("kind") ?? "");
  const id = Number(sp.get("id"));
  if (!kind || !Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "Bad request" }, { status: 400 });
  const { table, col } = LINK[kind];
  const q = (sp.get("q") ?? "").trim();

  const scenes = await query(
    `SELECT s.scene_id, p.title AS production, s.scene_number, s.description,
            to_char(ss.shoot_date, 'DD Mon YYYY') AS shoot_day,
            to_char(ss.start_time, 'HH24:MI') AS starts_at,
            to_char(ss.end_time, 'HH24:MI') AS ends_at,
            l.name AS location
       FROM scene s
       JOIN production p ON p.production_id = s.production_id
       LEFT JOIN LATERAL (
            SELECT * FROM shooting_schedule x
             WHERE x.scene_id = s.scene_id AND x.status <> 'CANCELLED'
             ORDER BY x.shoot_date, x.start_time LIMIT 1) ss ON true
       LEFT JOIN location l ON l.location_id = ss.location_id
      WHERE s.status <> 'CANCELLED'
        AND p.status NOT IN ('CANCELLED', 'COMPLETED')
        AND ($1::int IS NULL OR p.manager_id = $1)
        AND s.scene_id NOT IN (SELECT scene_id FROM ${table} WHERE ${col} = $2)
        AND ($3 = '' OR p.title ILIKE '%' || $3 || '%')
      ORDER BY ss.shoot_date NULLS LAST, p.title, s.scene_number
      LIMIT 20`,
    [scope.managerId, id, q]
  );
  return NextResponse.json({ scenes });
});
