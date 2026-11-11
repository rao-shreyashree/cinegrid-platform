import { NextResponse } from "next/server";
import { z } from "zod";
import { query } from "@/lib/db";
import { withAuth } from "@/lib/auth/session";
import { dbError, scopeFor } from "@/lib/finance";

const Body = z.object({
  invoice_id: z.number().int().positive(),
  amount: z.number().positive().max(1_000_000_000),
  method: z.enum(["UPI", "NEFT", "CHEQUE", "CARD"]),
});

// POST /api/finance/payments -> inserts a payment. The trigger updates the invoice status and
// rejects payments on DRAFT invoices and overpayments; its message is passed back to the UI.
export const POST = withAuth(["ADMIN", "PRODUCTION_MANAGER"], async (req, session) => {
  const scope = scopeFor(session);
  if (!scope) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Enter an amount above zero and choose a payment method." }, { status: 400 });
  }
  const { invoice_id, amount, method } = parsed.data;

  const owned = await query(
    `SELECT 1 FROM invoice i JOIN production p ON p.production_id = i.production_id
      WHERE i.invoice_id = $1 AND ($2::int IS NULL OR p.manager_id = $2)`,
    [invoice_id, scope.managerId]
  );
  if (owned.length === 0) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });

  try {
    const [row] = await query<{ payment_id: number }>(
      "INSERT INTO payment (invoice_id, amount, method) VALUES ($1, ROUND($2::numeric, 2), $3) RETURNING payment_id",
      [invoice_id, amount, method]
    );
    return NextResponse.json({ payment_id: row.payment_id }, { status: 201 });
  } catch (err) {
    return dbError(err);
  }
});
