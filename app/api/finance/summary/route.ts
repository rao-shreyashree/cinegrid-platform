import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { withAuth } from "@/lib/auth/session";
import { scopeFor } from "@/lib/finance";

type Row = {
  production_id: number;
  title: string;
  status: string;
  manager: string | null;
  budget: number;
  total_cost: number;
  invoiced: number;
  paid: number;
  outstanding: number;
  pct_used: number | null;
  over_budget: boolean;
  alert_since: string | null;
  unbilled: number;
};

// Charges that exist but are not on any invoice yet (what generate_invoice would bill).
const UNBILLED = `
  SELECT COALESCE(SUM(c), 0) FROM (
    SELECT ss.charge AS c FROM shooting_schedule ss JOIN scene s ON s.scene_id = ss.scene_id
     WHERE s.production_id = pc.production_id AND ss.invoice_id IS NULL AND ss.status <> 'CANCELLED'
    UNION ALL
    SELECT eb.charge FROM equipment_booking eb
      JOIN shooting_schedule ss ON ss.schedule_id = eb.schedule_id JOIN scene s ON s.scene_id = ss.scene_id
     WHERE s.production_id = pc.production_id AND eb.invoice_id IS NULL AND eb.status <> 'CANCELLED'
    UNION ALL
    SELECT sb.charge FROM service_booking sb
     WHERE sb.production_id = pc.production_id AND sb.invoice_id IS NULL AND sb.status <> 'CANCELLED'
  ) t`;

// Managers only see their own productions, so the monthly series is recomputed with that filter.
const MONTHLY_SCOPED = `
  WITH inv AS (
    SELECT date_trunc('month', i.issue_date)::date AS month, SUM(i.total_amount) AS invoiced
      FROM invoice i JOIN production p ON p.production_id = i.production_id
     WHERE i.status <> 'DRAFT' AND i.issue_date IS NOT NULL AND p.manager_id = $1 GROUP BY 1
  ), pay AS (
    SELECT date_trunc('month', pm.payment_date)::date AS month, SUM(pm.amount) AS collected
      FROM payment pm JOIN invoice i ON i.invoice_id = pm.invoice_id
      JOIN production p ON p.production_id = i.production_id
     WHERE p.manager_id = $1 GROUP BY 1
  )
  SELECT to_char(COALESCE(inv.month, pay.month), 'YYYY-MM') AS month,
         COALESCE(inv.invoiced, 0)::float8 AS invoiced, COALESCE(pay.collected, 0)::float8 AS collected
    FROM inv FULL JOIN pay ON pay.month = inv.month ORDER BY 1`;

export const GET = withAuth(["ADMIN", "PRODUCTION_MANAGER"], async (_req, session) => {
  const scope = scopeFor(session);
  if (!scope) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const m = scope.managerId;

  const productions = await query<Row>(
    `SELECT pc.production_id, pc.title, p.status, mgr.name AS manager,
            COALESCE(pc.budget, 0)::float8   AS budget,
            pc.total_cost::float8            AS total_cost,
            pc.invoiced::float8              AS invoiced,
            pc.paid::float8                  AS paid,
            pc.outstanding::float8           AS outstanding,
            bu.pct_used::float8              AS pct_used,
            bu.over_budget,
            to_char(ba.raised_at, 'DD Mon YYYY') AS alert_since,
            (${UNBILLED})::float8            AS unbilled
       FROM v_production_cost pc
       JOIN production p            ON p.production_id = pc.production_id
       JOIN v_budget_utilization bu ON bu.production_id = pc.production_id
       LEFT JOIN users mgr          ON mgr.user_id = p.manager_id
       LEFT JOIN budget_alert ba    ON ba.production_id = pc.production_id AND ba.resolved_at IS NULL
      WHERE ($1::int IS NULL OR p.manager_id = $1)
      ORDER BY pc.total_cost DESC, pc.production_id`,
    [m]
  );

  const monthly =
    m === null
      ? await query(
          `SELECT to_char(month, 'YYYY-MM') AS month, invoiced::float8 AS invoiced, collected::float8 AS collected
             FROM v_monthly_revenue`
        )
      : await query(MONTHLY_SCOPED, [m]);

  const sum = (f: (r: Row) => number) => productions.reduce((t, r) => t + f(r), 0);
  const totals = {
    budget: sum((r) => r.budget),
    total_cost: sum((r) => r.total_cost),
    invoiced: sum((r) => r.invoiced),
    paid: sum((r) => r.paid),
    outstanding: sum((r) => r.outstanding),
    unbilled: sum((r) => r.unbilled),
    over_budget_count: productions.filter((r) => r.over_budget).length,
  };

  return NextResponse.json({ scope: m === null ? "all" : "own", totals, monthly, productions });
});
