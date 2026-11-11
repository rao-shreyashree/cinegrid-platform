import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { withAuth } from "@/lib/auth/session";
import { DATE, dbError } from "@/lib/http";

// GET /api/schedule?from=2026-11-10&to=2026-11-16   (any logged-in user)
// Defaults: from = today, to = from + 6 days. Capped at 62 days.
export const GET = withAuth(null, async (req) => {
  const sp = req.nextUrl.searchParams;
  const from = sp.get("from");
  const to = sp.get("to");
  if ((from && !DATE.test(from)) || (to && !DATE.test(to))) {
    return NextResponse.json({ error: "from and to must be YYYY-MM-DD" }, { status: 400 });
  }
  try {
    const shoots = await query(
      `SELECT schedule_id, shoot_date::text AS shoot_date,
              to_char(start_time, 'HH24:MI') AS starts_at, to_char(end_time, 'HH24:MI') AS ends_at,
              status, location, production, scene_number
         FROM v_daily_schedule
        WHERE shoot_date BETWEEN COALESCE($1::date, CURRENT_DATE)
                             AND LEAST(COALESCE($2::date, COALESCE($1::date, CURRENT_DATE) + 6),
                                       COALESCE($1::date, CURRENT_DATE) + 62)
        ORDER BY shoot_date, start_time, location`,
      [from, to]
    );
    return NextResponse.json({ shoots });
  } catch (err) {
    return dbError(err);
  }
});
