import { NextResponse } from "next/server";
import { z } from "zod";
import { query } from "@/lib/db";
import { withAuth } from "@/lib/auth/session";
import { VENDOR_TYPES, dbFail, parseId, readBody } from "@/lib/vendors";

const Patch = z
  .object({
    name: z.string().trim().min(2).max(255).optional(),
    vendor_type: z.enum(VENDOR_TYPES).optional(),
    contact_info: z.string().trim().max(255).optional(),
  })
  .refine((b) => Object.keys(b).length > 0, { message: "Nothing to update" });

// PATCH /api/vendors/5   admin only. No delete: bookings reference vendors.
export const PATCH = withAuth(["ADMIN"], async (req, _session, ctx) => {
  const id = parseId((await ctx.params).id);
  if (!id) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  const body = await readBody(req, Patch);
  if (!body.ok) return body.error;
  const b = body.data;
  try {
    const rows = await query(
      `UPDATE vendor SET name = COALESCE($2, name), vendor_type = COALESCE($3, vendor_type),
                         contact_info = COALESCE($4, contact_info)
        WHERE vendor_id = $1 RETURNING vendor_id`,
      [id, b.name ?? null, b.vendor_type ?? null, b.contact_info ?? null]
    );
    if (rows.length === 0) return NextResponse.json({ error: "Vendor not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return dbFail(err);
  }
});
