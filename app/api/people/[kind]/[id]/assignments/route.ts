import { NextResponse } from "next/server";
import { z } from "zod";
import { query } from "@/lib/db";
import { withAuth } from "@/lib/auth/session";
import { dbError, scopeFor } from "@/lib/finance";
import { LINK, parseKind } from "@/lib/people";

const ROLES = ["ADMIN", "PRODUCTION_MANAGER"] as const;
type Ctx = { params: Promise<{ kind: string; id: string }> };

async function resolve(ctx: Ctx) {
  const { kind: rawKind, id: rawId } = await ctx.params;
  const kind = parseKind(rawKind);
  const id = Number(rawId);
  if (!kind || !Number.isInteger(id) || id <= 0) return null;
  return { kind, id, ...LINK[kind] };
}

// Is this scene one the user may change? (admin: any live scene; manager: scenes of own productions)
async function sceneAllowed(sceneId: number, managerId: number | null) {
  const rows = await query(
    `SELECT 1 FROM scene s JOIN production p ON p.production_id = s.production_id
      WHERE s.scene_id = $1 AND s.status <> 'CANCELLED' AND ($2::int IS NULL OR p.manager_id = $2)`,
    [sceneId, managerId]
  );
  return rows.length > 0;
}

// GET: every scene this person is assigned to, with its shoot slot
export const GET = withAuth([...ROLES], async (_req, _session, ctx: Ctx) => {
  const t = await resolve(ctx);
  if (!t) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const assignments = await query(
    `SELECT s.scene_id, p.title AS production, s.scene_number,
            to_char(ss.shoot_date, 'DD Mon YYYY') AS shoot_day,
            to_char(ss.start_time, 'HH24:MI') AS starts_at,
            to_char(ss.end_time, 'HH24:MI') AS ends_at,
            l.name AS location
       FROM ${t.table} a
       JOIN scene s ON s.scene_id = a.scene_id
       JOIN production p ON p.production_id = s.production_id
       LEFT JOIN LATERAL (
            SELECT * FROM shooting_schedule x
             WHERE x.scene_id = s.scene_id AND x.status <> 'CANCELLED'
             ORDER BY x.shoot_date, x.start_time LIMIT 1) ss ON true
       LEFT JOIN location l ON l.location_id = ss.location_id
      WHERE a.${t.col} = $1
      ORDER BY ss.shoot_date NULLS LAST, p.title, s.scene_number`,
    [t.id]
  );
  return NextResponse.json({ assignments });
});

const Body = z.object({ scene_id: z.number().int().positive() });

// POST { scene_id }: assign. The clash trigger rejects double-booking; its message goes back to the UI.
export const POST = withAuth([...ROLES], async (req, session, ctx: Ctx) => {
  const scope = scopeFor(session);
  const t = await resolve(ctx);
  if (!scope || !t) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "scene_id is required" }, { status: 400 });
  const sceneId = parsed.data.scene_id;

  if (!(await sceneAllowed(sceneId, scope.managerId))) {
    return NextResponse.json({ error: "You can only assign people to scenes of your own productions." }, { status: 403 });
  }
  const exists = await query(`SELECT 1 FROM ${LINK[t.kind].person} WHERE ${t.col} = $1`, [t.id]);
  if (exists.length === 0) return NextResponse.json({ error: "Person not found" }, { status: 404 });

  try {
    await query(`INSERT INTO ${t.table} (scene_id, ${t.col}) VALUES ($1, $2)`, [sceneId, t.id]);
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (err) {
    if ((err as { code?: string }).code === "23505") {
      return NextResponse.json({ error: "Already assigned to that scene." }, { status: 409 });
    }
    return dbError(err);
  }
});

// DELETE ?scene_id=N: remove the assignment
export const DELETE = withAuth([...ROLES], async (req, session, ctx: Ctx) => {
  const scope = scopeFor(session);
  const t = await resolve(ctx);
  const sceneId = Number(new URL(req.url).searchParams.get("scene_id"));
  if (!scope || !t || !Number.isInteger(sceneId) || sceneId <= 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!(await sceneAllowed(sceneId, scope.managerId))) {
    return NextResponse.json({ error: "You can only change scenes of your own productions." }, { status: 403 });
  }
  await query(`DELETE FROM ${t.table} WHERE scene_id = $1 AND ${t.col} = $2`, [sceneId, t.id]);
  return NextResponse.json({ ok: true });
});
