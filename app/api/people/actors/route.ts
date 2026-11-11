import { NextResponse } from "next/server";
import { z } from "zod";
import { query } from "@/lib/db";
import { withAuth } from "@/lib/auth/session";
import { dbError } from "@/lib/finance";

const ROLES = ["ADMIN", "PRODUCTION_MANAGER"] as const;

export const GET = withAuth([...ROLES], async () => {
  const actors = await query(
    `SELECT a.actor_id AS id, a.name, a.contact_info,
            COUNT(DISTINCT sc.scene_id)::int AS scenes,
            COUNT(DISTINCT s.production_id)::int AS productions
       FROM actor a
       LEFT JOIN scene_cast sc ON sc.actor_id = a.actor_id
       LEFT JOIN scene s ON s.scene_id = sc.scene_id
      GROUP BY a.actor_id ORDER BY a.name`
  );
  return NextResponse.json({ people: actors });
});

const Body = z.object({ name: z.string().trim().min(2).max(255), contact_info: z.string().trim().max(255).optional() });

export const POST = withAuth([...ROLES], async (req) => {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter a name of at least two characters." }, { status: 400 });
  try {
    const [row] = await query<{ id: number }>(
      "INSERT INTO actor (name, contact_info) VALUES ($1, NULLIF($2, '')) RETURNING actor_id AS id",
      [parsed.data.name, parsed.data.contact_info ?? ""]
    );
    return NextResponse.json({ id: row.id }, { status: 201 });
  } catch (err) {
    return dbError(err);
  }
});
