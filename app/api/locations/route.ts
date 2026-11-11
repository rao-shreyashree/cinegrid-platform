import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { withAuth } from "@/lib/auth/session";
import { DATE, TIME, dbError } from "@/lib/http";

const TYPES = ["studio", "sound_stage", "outdoor", "backlot", "set"];
const STATUSES = ["AVAILABLE", "MAINTENANCE", "UNAVAILABLE"];

/**
 * GET /api/locations?type=set&status=AVAILABLE      browse (with utilization)
 * GET /api/locations?free_on=2026-11-12&from=09:00&to=11:00&type=set
 *                                                   only locations bookable for that slot (booking page)
 * Rental prices are not returned to crew.
 */
export const GET = withAuth(null, async (req, session) => {
  const sp = req.nextUrl.searchParams;
  const type = sp.get("type");
  const status = sp.get("status");
  if (type && !TYPES.includes(type)) return NextResponse.json({ error: "Invalid type" }, { status: 400 });
  if (status && !STATUSES.includes(status)) return NextResponse.json({ error: "Invalid status" }, { status: 400 });

  const on = sp.get("free_on"), from = sp.get("from"), to = sp.get("to");
  const hidePrice = session.role === "CREW";

  try {
    if (on || from || to) {
      if (!on || !from || !to || !DATE.test(on) || !TIME.test(from) || !TIME.test(to)) {
        return NextResponse.json({ error: "free_on (YYYY-MM-DD), from and to (HH:MM) are all required" }, { status: 400 });
      }
      if (to <= from) return NextResponse.json({ error: "End time must be after start time" }, { status: 400 });
      const rows = await query(
        `SELECT l.location_id, l.name, l.type, l.capacity, l.rental_price::float AS rental_price
           FROM location l
          WHERE l.status = 'AVAILABLE'
            AND ($1::text IS NULL OR l.type = $1)
            AND NOT EXISTS (
                  SELECT 1 FROM shooting_schedule ss
                   WHERE ss.location_id = l.location_id AND ss.status <> 'CANCELLED'
                     AND ss.during && tsrange($2::date + $3::time, $2::date + $4::time))
          ORDER BY l.name`,
        [type, on, from, to]
      );
      return NextResponse.json({ locations: hidePrice ? rows.map((r) => ({ ...r, rental_price: null })) : rows });
    }

    const rows = await query(
      `SELECT l.location_id, l.name, l.type, l.capacity, l.status, l.rental_price::float AS rental_price,
              l.description, u.bookings::int AS bookings, u.booked_hours::float AS booked_hours
         FROM location l JOIN v_location_utilization u ON u.location_id = l.location_id
        WHERE ($1::text IS NULL OR l.type = $1) AND ($2::text IS NULL OR l.status = $2)
        ORDER BY l.name`,
      [type, status]
    );
    return NextResponse.json({ locations: hidePrice ? rows.map((r) => ({ ...r, rental_price: null })) : rows });
  } catch (err) {
    return dbError(err);
  }
});
