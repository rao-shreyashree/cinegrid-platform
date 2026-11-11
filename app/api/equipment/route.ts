import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { withAuth } from "@/lib/auth/session";
import { dbError, parseId } from "@/lib/http";

const CATEGORIES = ["camera", "lighting", "sound", "grip", "other"];
const STATUSES = ["AVAILABLE", "IN_USE", "MAINTENANCE"];

/**
 * GET /api/equipment?category=camera&status=IN_USE     browse (status is the computed one, with utilization)
 * GET /api/equipment?schedule_id=12&category=camera    only items bookable for that schedule slot (booking page)
 * Rental prices are not returned to crew.
 */
export const GET = withAuth(null, async (req, session) => {
  const sp = req.nextUrl.searchParams;
  const category = sp.get("category");
  const status = sp.get("status");
  if (category && !CATEGORIES.includes(category)) return NextResponse.json({ error: "Invalid category" }, { status: 400 });
  if (status && !STATUSES.includes(status)) return NextResponse.json({ error: "Invalid status" }, { status: 400 });

  const schedRaw = sp.get("schedule_id");
  const scheduleId = schedRaw ? parseId(schedRaw) : null;
  if (schedRaw && !scheduleId) return NextResponse.json({ error: "Invalid schedule_id" }, { status: 400 });
  const hidePrice = session.role === "CREW";

  try {
    if (scheduleId) {
      const rows = await query(
        `SELECT e.equipment_id, e.name, e.category, e.serial_number, e.rental_price::float AS rental_price
           FROM equipment e
          WHERE e.status = 'AVAILABLE'
            AND ($2::text IS NULL OR e.category = $2)
            AND NOT EXISTS (
                  SELECT 1 FROM equipment_booking eb
                    JOIN shooting_schedule target ON target.schedule_id = $1
                   WHERE eb.equipment_id = e.equipment_id AND eb.status <> 'CANCELLED'
                     AND eb.during && target.during)
          ORDER BY e.category, e.name`,
        [scheduleId, category]
      );
      return NextResponse.json({ equipment: hidePrice ? rows.map((r) => ({ ...r, rental_price: null })) : rows });
    }

    const rows = await query(
      `SELECT s.equipment_id, s.name, s.category, s.serial_number, s.current_status,
              e.rental_price::float AS rental_price, e.description,
              u.bookings::int AS bookings, u.booked_hours::float AS booked_hours
         FROM v_equipment_status s
         JOIN equipment e ON e.equipment_id = s.equipment_id
         JOIN v_equipment_utilization u ON u.equipment_id = s.equipment_id
        WHERE ($1::text IS NULL OR s.category = $1) AND ($2::text IS NULL OR s.current_status = $2)
        ORDER BY s.category, s.name`,
      [category, status]
    );
    return NextResponse.json({ equipment: hidePrice ? rows.map((r) => ({ ...r, rental_price: null })) : rows });
  } catch (err) {
    return dbError(err);
  }
});
