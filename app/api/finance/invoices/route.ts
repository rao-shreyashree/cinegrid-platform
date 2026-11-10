import { NextResponse } from "next/server";
import { z } from "zod";
import { query } from "@/lib/db";
import { withAuth } from "@/lib/auth/session";
import { dbError, scopeFor } from "@/lib/finance";

const ROLES = ["ADMIN", "PRODUCTION_MANAGER"] as const;

type InvoiceRow = { invoice_id: number; status: string; issue_date: string; total: number; paid: number };
type ItemRow = { invoice_id: number; item_type: string; description: string; charge: number };

// GET /api/finance/invoices?production_id=N  -> invoices of one production, with line items
export const GET = withAuth([...ROLES], async (req, session) => {
  const scope = scopeFor(session);
  if (!scope) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const pid = Number(new URL(req.url).searchParams.get("production_id"));
  if (!Number.isInteger(pid) || pid <= 0) {
    return NextResponse.json({ error: "production_id is required" }, { status: 400 });
  }

  const invoices = await query<InvoiceRow>(
    `SELECT i.invoice_id, i.status,
            COALESCE(to_char(i.issue_date, 'DD Mon YYYY'), '') AS issue_date,
            i.total_amount::float8 AS total,
            COALESCE(SUM(pm.amount), 0)::float8 AS paid
       FROM invoice i
       JOIN production p ON p.production_id = i.production_id
       LEFT JOIN payment pm ON pm.invoice_id = i.invoice_id
      WHERE i.production_id = $1 AND ($2::int IS NULL OR p.manager_id = $2)
      GROUP BY i.invoice_id
      ORDER BY i.invoice_id DESC`,
    [pid, scope.managerId]
  );

  const ids = invoices.map((i) => i.invoice_id);
  const items = ids.length
    ? await query<ItemRow>(
        `SELECT invoice_id, item_type, description, charge::float8 AS charge
           FROM v_invoice_items WHERE invoice_id = ANY($1::int[])
          ORDER BY invoice_id, item_type, description`,
        [ids]
      )
    : [];

  return NextResponse.json({
    invoices: invoices.map((i) => ({ ...i, items: items.filter((x) => x.invoice_id === i.invoice_id) })),
  });
});

const Body = z.object({ production_id: z.number().int().positive() });

// POST /api/finance/invoices  { production_id }  -> runs generate_invoice()
export const POST = withAuth([...ROLES], async (req, session) => {
  const scope = scopeFor(session);
  if (!scope) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "production_id is required" }, { status: 400 });
  const pid = parsed.data.production_id;

  const owned = await query(
    "SELECT 1 FROM production WHERE production_id = $1 AND ($2::int IS NULL OR manager_id = $2)",
    [pid, scope.managerId]
  );
  if (owned.length === 0) return NextResponse.json({ error: "Production not found" }, { status: 404 });

  try {
    const [row] = await query<{ id: number }>("SELECT generate_invoice($1) AS id", [pid]);
    return NextResponse.json({ invoice_id: row.id }, { status: 201 });
  } catch (err) {
    return dbError(err);
  }
});
