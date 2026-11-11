import { NextResponse } from "next/server";
import { z } from "zod";
import { query } from "@/lib/db";
import { withAuth } from "@/lib/auth/session";
import { VENDOR_TYPES, dbFail, readBody } from "@/lib/vendors";

// GET /api/vendors?q=cater&type=catering   admin, manager
// Usage (bookings, spend) counts non-cancelled service bookings; a manager only sees usage on their own productions.
export const GET = withAuth(["ADMIN", "PRODUCTION_MANAGER"], async (req, session) => {
  const sp = req.nextUrl.searchParams;
  const q = sp.get("q")?.trim().slice(0, 100) || null;
  const type = sp.get("type");
  if (type && !(VENDOR_TYPES as readonly string[]).includes(type)) {
    return NextResponse.json({ error: "Invalid type" }, { status: 400 });
  }
  try {
    const vendors = await query(
      `SELECT v.vendor_id, v.name, v.vendor_type, v.contact_info,
              COUNT(sb.service_booking_id)::int AS bookings,
              COALESCE(SUM(sb.charge), 0)::float AS total_spend
         FROM vendor v
         LEFT JOIN service_booking sb
                ON sb.vendor_id = v.vendor_id AND sb.status <> 'CANCELLED'
               AND ($3::boolean OR sb.production_id IN (SELECT production_id FROM production WHERE manager_id = $4))
        WHERE ($1::text IS NULL OR v.name ILIKE '%' || $1 || '%')
          AND ($2::text IS NULL OR v.vendor_type = $2)
        GROUP BY v.vendor_id
        ORDER BY v.name`,
      [q, type, session.role === "ADMIN", session.uid]
    );
    return NextResponse.json({ vendors, can_manage: session.role === "ADMIN" });
  } catch (err) {
    return dbFail(err);
  }
});

const Create = z.object({
  name: z.string().trim().min(2).max(255),
  vendor_type: z.enum(VENDOR_TYPES),
  contact_info: z.string().trim().max(255).optional(),
});

// POST /api/vendors   admin only
export const POST = withAuth(["ADMIN"], async (req) => {
  const body = await readBody(req, Create);
  if (!body.ok) return body.error;
  const b = body.data;
  try {
    const [row] = await query<{ vendor_id: number }>(
      "INSERT INTO vendor (name, vendor_type, contact_info) VALUES ($1, $2, $3) RETURNING vendor_id",
      [b.name, b.vendor_type, b.contact_info || null]
    );
    return NextResponse.json({ vendor_id: row.vendor_id }, { status: 201 });
  } catch (err) {
    return dbFail(err);
  }
});
