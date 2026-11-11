import { NextResponse } from "next/server";
import { z } from "zod";
import { query } from "@/lib/db";
import { withAuth } from "@/lib/auth/session";
import { dbError } from "@/lib/finance";

const ROLES = ["ADMIN", "PRODUCTION_MANAGER"] as const;

export const GET = withAuth([...ROLES], async () => {
  const crew = await query(
    `SELECT c.crew_id AS id, c.name, c.crew_role, c.contact_info,
            (c.user_id IS NOT NULL) AS has_login,
            COUNT(DISTINCT sc.scene_id)::int AS scenes,
            COUNT(DISTINCT s.production_id)::int AS productions
       FROM crew_member c
       LEFT JOIN scene_crew sc ON sc.crew_id = c.crew_id
       LEFT JOIN scene s ON s.scene_id = sc.scene_id
      GROUP BY c.crew_id ORDER BY c.name`
  );
  return NextResponse.json({ people: crew });
});

const Body = z.object({
  name: z.string().trim().min(2).max(255),
  crew_role: z.string().trim().min(2).max(255),
  contact_info: z.string().trim().max(255).optional(),
});

export const POST = withAuth([...ROLES], async (req) => {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter a name and a crew role." }, { status: 400 });
  try {
    const [row] = await query<{ id: number }>(
      "INSERT INTO crew_member (name, crew_role, contact_info) VALUES ($1, $2, NULLIF($3, '')) RETURNING crew_id AS id",
      [parsed.data.name, parsed.data.crew_role, parsed.data.contact_info ?? ""]
    );
    return NextResponse.json({ id: row.id }, { status: 201 });
  } catch (err) {
    return dbError(err);
  }
});
