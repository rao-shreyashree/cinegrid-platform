import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { withAuth } from "@/lib/auth/session";

// Dashboard numbers come from the SQL views (04_views.sql).
export const GET = withAuth(null, async (_req, session) => {
  const [stats] = await query(
    `SELECT
       (SELECT count(*) FROM v_active_productions)::int                                 AS active_productions,
       (SELECT count(*) FROM v_daily_schedule WHERE shoot_date = CURRENT_DATE)::int     AS todays_shoots,
       (SELECT count(*) FROM v_equipment_status WHERE current_status = 'IN_USE')::int   AS equipment_in_use,
       (SELECT count(*) FROM incident WHERE status <> 'RESOLVED')::int                  AS open_incidents`
  );

  const today = await query(
    `SELECT schedule_id, location, production, scene_number, status,
            to_char(start_time, 'HH24:MI') AS starts_at,
            to_char(end_time,   'HH24:MI') AS ends_at
       FROM v_daily_schedule
      WHERE shoot_date = CURRENT_DATE
      ORDER BY location, start_time`
  );

  // Money figures are not for crew.
  let outstanding_amount: number | null = null;
  if (session.role !== "CREW") {
    const [row] = await query<{ total: number }>(
      "SELECT COALESCE(sum(outstanding), 0)::float AS total FROM v_production_cost"
    );
    outstanding_amount = row.total;
  }

  return NextResponse.json({ ...stats, outstanding_amount, today });
});
