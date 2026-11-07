-- CineGrid 05_finance.sql : bill-once invoicing, budget alerts, finance views
-- Runs after 01-04. Touches shooting_schedule / equipment_booking / service_booking (add invoice_id).

-- ---------- 1. Link billable items to the invoice that billed them ----------
ALTER TABLE shooting_schedule ADD COLUMN invoice_id INT REFERENCES invoice(invoice_id) ON DELETE SET NULL;
ALTER TABLE equipment_booking ADD COLUMN invoice_id INT REFERENCES invoice(invoice_id) ON DELETE SET NULL;
ALTER TABLE service_booking   ADD COLUMN invoice_id INT REFERENCES invoice(invoice_id) ON DELETE SET NULL;

CREATE INDEX idx_schedule_invoice        ON shooting_schedule(invoice_id);
CREATE INDEX idx_equip_booking_invoice   ON equipment_booking(invoice_id);
CREATE INDEX idx_service_booking_invoice ON service_booking(invoice_id);

-- ---------- 2. generate_invoice ----------
-- Bills every non-cancelled location, equipment and service charge of a production
-- that has not been invoiced yet, then stamps those rows with the new invoice_id.
-- Returns the new invoice_id. Runs as one transaction: any error rolls everything back.
CREATE OR REPLACE FUNCTION generate_invoice(
    p_production_id INT,
    p_issue_date    DATE DEFAULT CURRENT_DATE
) RETURNS INT AS $$
DECLARE
    v_total NUMERIC;
    v_count INT;
    v_inv   INT;
BEGIN
    -- Serialize concurrent invoicing of the same production (NO KEY UPDATE does not block inserts of child rows)
    PERFORM 1 FROM production WHERE production_id = p_production_id FOR NO KEY UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Production % not found', p_production_id;
    END IF;

    SELECT COALESCE(SUM(c), 0), COUNT(*) INTO v_total, v_count
    FROM (
        SELECT ss.charge AS c
          FROM shooting_schedule ss JOIN scene s ON s.scene_id = ss.scene_id
         WHERE s.production_id = p_production_id AND ss.invoice_id IS NULL AND ss.status <> 'CANCELLED'
        UNION ALL
        SELECT eb.charge
          FROM equipment_booking eb
          JOIN shooting_schedule ss ON ss.schedule_id = eb.schedule_id
          JOIN scene s ON s.scene_id = ss.scene_id
         WHERE s.production_id = p_production_id AND eb.invoice_id IS NULL AND eb.status <> 'CANCELLED'
        UNION ALL
        SELECT sb.charge
          FROM service_booking sb
         WHERE sb.production_id = p_production_id AND sb.invoice_id IS NULL AND sb.status <> 'CANCELLED'
    ) t;

    IF v_count = 0 THEN
        RAISE EXCEPTION 'Nothing to invoice for production %', p_production_id;
    END IF;

    INSERT INTO invoice (production_id, total_amount, status, issue_date)
    VALUES (p_production_id, v_total, 'ISSUED', p_issue_date)
    RETURNING invoice_id INTO v_inv;

    UPDATE shooting_schedule ss SET invoice_id = v_inv
      FROM scene s
     WHERE s.scene_id = ss.scene_id AND s.production_id = p_production_id
       AND ss.invoice_id IS NULL AND ss.status <> 'CANCELLED';

    UPDATE equipment_booking eb SET invoice_id = v_inv
      FROM shooting_schedule ss JOIN scene s ON s.scene_id = ss.scene_id
     WHERE ss.schedule_id = eb.schedule_id AND s.production_id = p_production_id
       AND eb.invoice_id IS NULL AND eb.status <> 'CANCELLED';

    UPDATE service_booking SET invoice_id = v_inv
     WHERE production_id = p_production_id AND invoice_id IS NULL AND status <> 'CANCELLED';

    RETURN v_inv;
END;
$$ LANGUAGE plpgsql;

-- ---------- 3. Budget exceeded: FLAG (never blocks) ----------
CREATE TABLE budget_alert (
    alert_id        INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    production_id   INT NOT NULL REFERENCES production(production_id) ON DELETE CASCADE,
    budget          DECIMAL(12,2) NOT NULL,
    committed_cost  DECIMAL(12,2) NOT NULL,
    raised_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    resolved_at     TIMESTAMP            -- NULL = still open
);
-- at most one open alert per production
CREATE UNIQUE INDEX uq_budget_alert_open ON budget_alert(production_id) WHERE resolved_at IS NULL;

CREATE OR REPLACE FUNCTION fn_budget_check() RETURNS trigger AS $$
DECLARE
    v_pid    INT;
    v_budget NUMERIC;
    v_cost   NUMERIC;
BEGIN
    IF TG_TABLE_NAME IN ('production', 'service_booking') THEN
        v_pid := NEW.production_id;
    ELSIF TG_TABLE_NAME = 'shooting_schedule' THEN
        SELECT production_id INTO v_pid FROM scene WHERE scene_id = NEW.scene_id;
    ELSE  -- equipment_booking
        SELECT s.production_id INTO v_pid
          FROM shooting_schedule ss JOIN scene s ON s.scene_id = ss.scene_id
         WHERE ss.schedule_id = NEW.schedule_id;
    END IF;

    SELECT budget INTO v_budget FROM production WHERE production_id = v_pid;
    IF v_budget IS NULL THEN
        RETURN NULL;
    END IF;

    v_cost := production_total_cost(v_pid);

    IF v_cost > v_budget THEN
        INSERT INTO budget_alert (production_id, budget, committed_cost)
        VALUES (v_pid, v_budget, v_cost)
        ON CONFLICT (production_id) WHERE resolved_at IS NULL
        DO UPDATE SET committed_cost = EXCLUDED.committed_cost,
                      budget         = EXCLUDED.budget,
                      updated_at     = CURRENT_TIMESTAMP;
    ELSE
        UPDATE budget_alert SET resolved_at = CURRENT_TIMESTAMP
         WHERE production_id = v_pid AND resolved_at IS NULL;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_budget_schedule
AFTER INSERT OR UPDATE OF charge, status ON shooting_schedule
FOR EACH ROW EXECUTE FUNCTION fn_budget_check();

CREATE TRIGGER trg_budget_equipment
AFTER INSERT OR UPDATE OF charge, status ON equipment_booking
FOR EACH ROW EXECUTE FUNCTION fn_budget_check();

CREATE TRIGGER trg_budget_service
AFTER INSERT OR UPDATE OF charge, status ON service_booking
FOR EACH ROW EXECUTE FUNCTION fn_budget_check();

CREATE TRIGGER trg_budget_production
AFTER UPDATE OF budget ON production
FOR EACH ROW EXECUTE FUNCTION fn_budget_check();

-- ---------- 4. Views ----------
CREATE VIEW v_budget_utilization AS
SELECT pc.production_id, pc.title, pc.budget, pc.total_cost,
       CASE WHEN pc.budget > 0 THEN ROUND(100 * pc.total_cost / pc.budget, 1) END AS pct_used,
       (pc.budget IS NOT NULL AND pc.total_cost > pc.budget) AS over_budget
FROM v_production_cost pc;

CREATE VIEW v_over_budget AS
SELECT u.production_id, u.title, u.budget, u.total_cost,
       u.total_cost - u.budget AS overrun, u.pct_used, a.raised_at
FROM v_budget_utilization u
LEFT JOIN budget_alert a ON a.production_id = u.production_id AND a.resolved_at IS NULL
WHERE u.over_budget;

-- Line items of each invoice (breakdown across the three billable tables)
CREATE VIEW v_invoice_items AS
SELECT ss.invoice_id, 'LOCATION' AS item_type, ss.schedule_id AS item_id,
       l.name || ' on ' || ss.shoot_date::text AS description, ss.charge
  FROM shooting_schedule ss JOIN location l ON l.location_id = ss.location_id
 WHERE ss.invoice_id IS NOT NULL
UNION ALL
SELECT eb.invoice_id, 'EQUIPMENT', eb.equip_booking_id, e.name, eb.charge
  FROM equipment_booking eb JOIN equipment e ON e.equipment_id = eb.equipment_id
 WHERE eb.invoice_id IS NOT NULL
UNION ALL
SELECT sb.invoice_id, 'SERVICE', sb.service_booking_id, sb.service_name, sb.charge
  FROM service_booking sb
 WHERE sb.invoice_id IS NOT NULL;

-- Invoiced (by issue month) vs collected (by payment month)
CREATE VIEW v_monthly_revenue AS
WITH inv AS (
    SELECT date_trunc('month', issue_date)::date AS month, SUM(total_amount) AS invoiced
    FROM invoice WHERE status <> 'DRAFT' AND issue_date IS NOT NULL GROUP BY 1
), pay AS (
    SELECT date_trunc('month', payment_date)::date AS month, SUM(amount) AS collected
    FROM payment GROUP BY 1
)
SELECT COALESCE(inv.month, pay.month) AS month,
       COALESCE(inv.invoiced, 0)  AS invoiced,
       COALESCE(pay.collected, 0) AS collected
FROM inv FULL JOIN pay ON pay.month = inv.month
ORDER BY 1;
