import { NextResponse } from "next/server";
import { z } from "zod";
import { query } from "@/lib/db";
import { withAuth } from "@/lib/auth/session";
import { BOOKING_STATUSES, DATETIME, dbFail, parseId, readBody } from "@/lib/vendors";

// GET /api/service-bookings?production_id=&vendor_id=&status=   admin: all, manager: own productions
// Also returns the options for the new-booking form (own non-finished productions, all vendors).
export const GET = withAuth(["ADMIN", "PRODUCTION_MANAGER"], async (req, session) => {
  const sp = req.nextUrl.searchParams;
  const productionId = sp.get("production_id") ? parseId(sp.get("production_id")) : null;
  const vendorId = sp.get("vendor_id") ? parseId(sp.get("vendor_id")) : null;
  const status = sp.get("status");
  if ((sp.get("production_id") && !productionId) || (sp.get("vendor_id") && !vendorId)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  if (status && !(BOOKING_STATUSES as readonly string[]).includes(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }
  const isAdmin = session.role === "ADMIN";
  try {
    const bookings = await query(
      `SELECT sb.service_booking_id AS id, sb.production_id, p.title AS production,
              sb.vendor_id, v.name AS vendor, v.vendor_type, sb.service_name,
              to_char(sb.start_time, 'DD Mon HH24:MI') AS starts_at,
              to_char(sb.end_time,   'DD Mon HH24:MI') AS ends_at,
              sb.charge::float AS charge, sb.status, (sb.invoice_id IS NOT NULL) AS invoiced
         FROM service_booking sb
         JOIN production p ON p.production_id = sb.production_id
         JOIN vendor v ON v.vendor_id = sb.vendor_id
        WHERE ($1::int IS NULL OR sb.production_id = $1)
          AND ($2::int IS NULL OR sb.vendor_id = $2)
          AND ($3::text IS NULL OR sb.status = $3)
          AND ($4::boolean OR p.manager_id = $5)
        ORDER BY sb.start_time DESC
        LIMIT 200`,
      [productionId, vendorId, status, isAdmin, session.uid]
    );
    const productions = await query(
      `SELECT production_id, title FROM production
        WHERE status NOT IN ('CANCELLED', 'COMPLETED') AND ($1::boolean OR manager_id = $2)
        ORDER BY title`,
      [isAdmin, session.uid]
    );
    const vendors = await query("SELECT vendor_id, name, vendor_type FROM vendor ORDER BY name");
    return NextResponse.json({ bookings, options: { productions, vendors }, can_manage: isAdmin });
  } catch (err) {
    return dbFail(err);
  }
});

const Create = z
  .object({
    production_id: z.number().int().positive(),
    vendor_id: z.number().int().positive(),
    service_name: z.string().trim().min(2).max(255),
    start_time: z.string().regex(DATETIME),
    end_time: z.string().regex(DATETIME),
    charge: z.number().nonnegative().max(9_999_999_999),
  })
  .refine((b) => b.end_time > b.start_time, { message: "End must be after start", path: ["end_time"] });

// POST /api/service-bookings   admin: any production, manager: own. Created as REQUESTED; an admin confirms.
export const POST = withAuth(["ADMIN", "PRODUCTION_MANAGER"], async (req, session) => {
  const body = await readBody(req, Create);
  if (!body.ok) return body.error;
  const b = body.data;
  try {
    const [prod] = await query<{ status: string }>(
      "SELECT status FROM production WHERE production_id = $1 AND ($2::boolean OR manager_id = $3)",
      [b.production_id, session.role === "ADMIN", session.uid]
    );
    if (!prod) return NextResponse.json({ error: "Production not found, or you are not its manager" }, { status: 404 });
    if (prod.status === "CANCELLED" || prod.status === "COMPLETED") {
      return NextResponse.json({ error: `Production is ${prod.status.toLowerCase()}` }, { status: 422 });
    }

    const [row] = await query<{ service_booking_id: number }>(
      `INSERT INTO service_booking (production_id, vendor_id, service_name, start_time, end_time, charge, status)
       VALUES ($1, $2, $3, $4::timestamp, $5::timestamp, $6, 'REQUESTED')
       RETURNING service_booking_id`,
      [b.production_id, b.vendor_id, b.service_name, b.start_time, b.end_time, b.charge]
    );

    // Budget overrun is flagged by the DB trigger, never blocked. Tell the user.
    const [cost] = await query<{ budget: number | null; total: number }>(
      "SELECT budget::float AS budget, production_total_cost(production_id)::float AS total FROM production WHERE production_id = $1",
      [b.production_id]
    );
    const over = cost.budget !== null && cost.total > cost.budget;
    return NextResponse.json(
      { id: row.service_booking_id, over_budget: over, budget: cost.budget, total_cost: cost.total },
      { status: 201 }
    );
  } catch (err) {
    return dbFail(err);
  }
});
