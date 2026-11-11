import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { withAuth } from "@/lib/auth/session";

// A crew member's own scenes. Looked up through crew_member.user_id = the logged-in user,
// so a crew user can never ask for anyone else's work. No money figures here.
export const GET = withAuth(["CREW"], async (_req, session) => {
  const [person] = await query<{ crew_id: number; name: string; crew_role: string | null }>(
    "SELECT crew_id, name, crew_role FROM crew_member WHERE user_id = $1",
    [session.uid]
  );
  if (!person) return NextResponse.json({ person: null, items: [] });

  const items = await query(
    `SELECT s.scene_id, p.title AS production, s.scene_number, s.description,
            to_char(ss.shoot_date, 'Dy, DD Mon') AS day_label,
            to_char(ss.start_time, 'HH24:MI') AS starts_at,
            to_char(ss.end_time, 'HH24:MI') AS ends_at,
            l.name AS location, ss.status AS shoot_status,
            CASE WHEN ss.shoot_date IS NULL THEN 'unscheduled'
                 WHEN ss.shoot_date = CURRENT_DATE THEN 'today'
                 WHEN ss.shoot_date > CURRENT_DATE THEN 'upcoming'
                 ELSE 'past' END AS bucket
       FROM scene_crew sc
       JOIN scene s ON s.scene_id = sc.scene_id
       JOIN production p ON p.production_id = s.production_id
       LEFT JOIN shooting_schedule ss ON ss.scene_id = s.scene_id AND ss.status <> 'CANCELLED'
       LEFT JOIN location l ON l.location_id = ss.location_id
      WHERE sc.crew_id = $1
      ORDER BY ss.shoot_date NULLS LAST, ss.start_time, p.title, s.scene_number`,
    [person.crew_id]
  );
  return NextResponse.json({ person: { name: person.name, crew_role: person.crew_role }, items });
});
