-- CineGrid 04_views.sql

CREATE VIEW v_active_productions AS
SELECT p.production_id, p.title, p.type, p.status, p.start_date, p.planned_end_date,
       p.budget, ph.name AS production_house
FROM production p
LEFT JOIN production_house ph ON ph.house_id = p.house_id
WHERE p.status IN ('PRE_PRODUCTION','SHOOTING','POST_PRODUCTION');

CREATE VIEW v_daily_schedule AS
SELECT ss.shoot_date, ss.start_time, ss.end_time, ss.status,
       l.name AS location, p.title AS production, s.scene_number, ss.schedule_id
FROM shooting_schedule ss
JOIN scene s      ON s.scene_id = ss.scene_id
JOIN production p ON p.production_id = s.production_id
JOIN location l   ON l.location_id = ss.location_id
WHERE ss.status <> 'CANCELLED';

CREATE VIEW v_location_utilization AS
SELECT l.location_id, l.name, l.type,
       COUNT(ss.schedule_id) AS bookings,
       COALESCE(ROUND(SUM(range_hours(ss.during)), 1), 0) AS booked_hours
FROM location l
LEFT JOIN shooting_schedule ss ON ss.location_id = l.location_id AND ss.status <> 'CANCELLED'
GROUP BY l.location_id, l.name, l.type;

CREATE VIEW v_equipment_utilization AS
SELECT e.equipment_id, e.name, e.category, e.status,
       COUNT(eb.equip_booking_id) AS bookings,
       COALESCE(ROUND(SUM(range_hours(eb.during)), 1), 0) AS booked_hours
FROM equipment e
LEFT JOIN equipment_booking eb ON eb.equipment_id = e.equipment_id AND eb.status <> 'CANCELLED'
GROUP BY e.equipment_id, e.name, e.category, e.status;

CREATE VIEW v_production_cost AS
SELECT p.production_id, p.title, p.budget,
       production_total_cost(p.production_id) AS total_cost,
       COALESCE(inv.invoiced, 0) AS invoiced,
       COALESCE(pay.paid, 0)     AS paid,
       COALESCE(inv.invoiced, 0) - COALESCE(pay.paid, 0) AS outstanding
FROM production p
LEFT JOIN (SELECT production_id, SUM(total_amount) AS invoiced
           FROM invoice WHERE status <> 'DRAFT' GROUP BY production_id) inv
       ON inv.production_id = p.production_id
LEFT JOIN (SELECT i.production_id, SUM(pm.amount) AS paid
           FROM payment pm JOIN invoice i ON i.invoice_id = pm.invoice_id
           GROUP BY i.production_id) pay
       ON pay.production_id = p.production_id;
