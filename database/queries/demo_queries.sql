-- CineGrid demo queries (10). Read-only, safe to run any number of times.
-- Run from the repo root:
--   docker exec -i cinegrid-db psql -U cinegrid -d cinegrid < database/queries/demo_queries.sql
\pset pager off
\x off

\echo
\echo '=== Q1  Most utilized locations (JOIN + GROUP BY + SUM) ==='
SELECT l.name, l.type, COUNT(ss.schedule_id) AS bookings,
       ROUND(SUM(range_hours(ss.during)), 1) AS booked_hours
FROM location l
JOIN shooting_schedule ss ON ss.location_id = l.location_id AND ss.status <> 'CANCELLED'
GROUP BY l.location_id, l.name, l.type
ORDER BY booked_hours DESC
LIMIT 10;

\echo
\echo '=== Q2  Productions with the highest resource spending (UNION ALL + JOIN + GROUP BY) ==='
SELECT p.title, p.type, SUM(c.amount) AS total_spend,
       SUM(c.amount) FILTER (WHERE c.kind = 'location')  AS locations,
       SUM(c.amount) FILTER (WHERE c.kind = 'equipment') AS equipment,
       SUM(c.amount) FILTER (WHERE c.kind = 'service')   AS services
FROM production p
JOIN (
    SELECT s.production_id, 'location' AS kind, ss.charge AS amount
      FROM shooting_schedule ss JOIN scene s ON s.scene_id = ss.scene_id
     WHERE ss.status <> 'CANCELLED'
    UNION ALL
    SELECT s.production_id, 'equipment', eb.charge
      FROM equipment_booking eb
      JOIN shooting_schedule ss ON ss.schedule_id = eb.schedule_id
      JOIN scene s ON s.scene_id = ss.scene_id
     WHERE eb.status <> 'CANCELLED'
    UNION ALL
    SELECT production_id, 'service', charge FROM service_booking WHERE status <> 'CANCELLED'
) c ON c.production_id = p.production_id
GROUP BY p.production_id, p.title, p.type
ORDER BY total_spend DESC
LIMIT 10;

\echo
\echo '=== Q3  Locations above a utilization threshold (GROUP BY + HAVING) ==='
-- Change 20 to suit the data: look at Q1 first.
SELECT l.name, l.type, COUNT(*) AS bookings, ROUND(SUM(range_hours(ss.during)), 1) AS booked_hours
FROM location l
JOIN shooting_schedule ss ON ss.location_id = l.location_id AND ss.status <> 'CANCELLED'
GROUP BY l.location_id, l.name, l.type
HAVING SUM(range_hours(ss.during)) > 20
ORDER BY booked_hours DESC;

\echo
\echo '=== Q4  Productions using more equipment than average (subquery) ==='
WITH per_production AS (
    SELECT s.production_id, COUNT(*) AS items
    FROM equipment_booking eb
    JOIN shooting_schedule ss ON ss.schedule_id = eb.schedule_id
    JOIN scene s ON s.scene_id = ss.scene_id
    WHERE eb.status <> 'CANCELLED'
    GROUP BY s.production_id
)
SELECT p.title, pp.items AS equipment_bookings,
       (SELECT ROUND(AVG(items), 1) FROM per_production) AS average
FROM per_production pp
JOIN production p ON p.production_id = pp.production_id
WHERE pp.items > (SELECT AVG(items) FROM per_production)
ORDER BY pp.items DESC;

\echo
\echo '=== Q5  Crew members working on more than one production (JOIN + GROUP BY + HAVING) ==='
SELECT c.name, c.crew_role, COUNT(DISTINCT s.production_id) AS productions,
       string_agg(DISTINCT p.title, ', ' ORDER BY p.title) AS titles
FROM crew_member c
JOIN scene_crew sc ON sc.crew_id = c.crew_id
JOIN scene s ON s.scene_id = sc.scene_id
JOIN production p ON p.production_id = s.production_id
GROUP BY c.crew_id, c.name, c.crew_role
HAVING COUNT(DISTINCT s.production_id) > 1
ORDER BY productions DESC, c.name
LIMIT 15;

\echo
\echo '=== Q6a Overlapping bookings at the same location (must be ZERO rows: the exclusion constraint prevents them) ==='
SELECT l.name, a.schedule_id AS shoot_a, b.schedule_id AS shoot_b, a.during AS a_time, b.during AS b_time
FROM shooting_schedule a
JOIN shooting_schedule b ON b.location_id = a.location_id AND b.schedule_id > a.schedule_id AND a.during && b.during
JOIN location l ON l.location_id = a.location_id
WHERE a.status <> 'CANCELLED' AND b.status <> 'CANCELLED';

\echo
\echo '=== Q6b Tight turnarounds: another production starts within 30 minutes at the same location ==='
-- Add "AND a.shoot_date >= CURRENT_DATE" to see only upcoming ones.
SELECT l.name AS location, a.shoot_date, pa.title AS first_production,
       to_char(a.end_time, 'HH24:MI') AS ends, pb.title AS next_production,
       to_char(b.start_time, 'HH24:MI') AS starts, (b.start_time - a.end_time) AS gap
FROM shooting_schedule a
JOIN shooting_schedule b ON b.location_id = a.location_id AND b.shoot_date = a.shoot_date
                        AND b.schedule_id <> a.schedule_id
                        AND b.start_time >= a.end_time AND b.start_time - a.end_time <= INTERVAL '30 minutes'
JOIN location l ON l.location_id = a.location_id
JOIN scene sa ON sa.scene_id = a.scene_id JOIN production pa ON pa.production_id = sa.production_id
JOIN scene sb ON sb.scene_id = b.scene_id JOIN production pb ON pb.production_id = sb.production_id
WHERE a.status <> 'CANCELLED' AND b.status <> 'CANCELLED' AND pa.production_id <> pb.production_id
ORDER BY a.shoot_date, l.name
LIMIT 15;

\echo
\echo '=== Q7  Most frequently booked equipment (aggregation) ==='
SELECT e.name, e.category, COUNT(*) AS bookings, ROUND(SUM(range_hours(eb.during)), 1) AS booked_hours
FROM equipment e
JOIN equipment_booking eb ON eb.equipment_id = e.equipment_id AND eb.status <> 'CANCELLED'
GROUP BY e.equipment_id, e.name, e.category
ORDER BY bookings DESC, booked_hours DESC
LIMIT 10;

\echo
\echo '=== Q8  Monthly film-city revenue (aggregation + window function) ==='
SELECT to_char(date_trunc('month', payment_date), 'YYYY-MM') AS month,
       COUNT(*) AS payments,
       SUM(amount) AS revenue,
       SUM(SUM(amount)) OVER (ORDER BY date_trunc('month', payment_date)) AS cumulative
FROM payment
GROUP BY date_trunc('month', payment_date)
ORDER BY date_trunc('month', payment_date);

\echo
\echo '=== Q9  Productions with unpaid invoices (JOIN + subquery) ==='
SELECT p.title, i.invoice_id, i.status, i.total_amount,
       COALESCE(pay.paid, 0) AS paid, i.total_amount - COALESCE(pay.paid, 0) AS outstanding
FROM invoice i
JOIN production p ON p.production_id = i.production_id
LEFT JOIN (SELECT invoice_id, SUM(amount) AS paid FROM payment GROUP BY invoice_id) pay
       ON pay.invoice_id = i.invoice_id
WHERE i.status IN ('ISSUED', 'PARTIALLY_PAID', 'OVERDUE')
ORDER BY outstanding DESC
LIMIT 15;

\echo
\echo '=== Q10 Locations available tomorrow 09:00-17:00 (range overlap + NOT EXISTS) ==='
SELECT l.name, l.type, l.capacity, l.rental_price
FROM location l
WHERE l.status = 'AVAILABLE'
  AND NOT EXISTS (
        SELECT 1 FROM shooting_schedule ss
         WHERE ss.location_id = l.location_id AND ss.status <> 'CANCELLED'
           AND ss.during && tsrange((CURRENT_DATE + 1) + TIME '09:00', (CURRENT_DATE + 1) + TIME '17:00'))
ORDER BY l.type, l.name
LIMIT 20;
