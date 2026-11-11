-- CineGrid live database demos: constraints, functions, transactions, triggers.
-- Everything runs inside ONE transaction that is rolled back at the end, so it is safe to repeat and leaves no data.
-- Run from the repo root (after all seeds; db-clash-trigger must be merged for demo 5):
--   docker exec -i cinegrid-db psql -U cinegrid -d cinegrid < database/demo/demo_triggers.sql
\pset pager off
SET client_min_messages = notice;
BEGIN;

-- helper that exists only for this transaction: a throw-away scene in a production
CREATE FUNCTION pg_temp.demo_scene(p INT) RETURNS INT AS $$
    INSERT INTO scene (production_id, scene_number, description, planned_duration, priority, status)
    VALUES (p, (SELECT COALESCE(MAX(scene_number), 0) + 1 FROM scene WHERE production_id = p),
            'DEMO: temporary scene', 60, 'MEDIUM', 'PLANNED')
    RETURNING scene_id;
$$ LANGUAGE sql;

-- ---------------------------------------------------------------------------------------------
-- DEMO 1  Exclusion constraint + book_location(): overlapping bookings are rejected
-- ---------------------------------------------------------------------------------------------
DO $$
DECLARE p INT; l INT; s1 INT; s2 INT; sch INT;
BEGIN
    RAISE NOTICE E'\n=== DEMO 1: double-booking a location ===';
    SELECT production_id INTO p FROM production WHERE status <> 'CANCELLED' ORDER BY production_id LIMIT 1;
    SELECT location_id INTO l FROM location WHERE status = 'AVAILABLE' ORDER BY location_id LIMIT 1;
    s1 := pg_temp.demo_scene(p);  s2 := pg_temp.demo_scene(p);

    sch := book_location(s1, l, DATE '2031-03-03', TIME '09:00', TIME '17:00');
    RAISE NOTICE 'Scene % booked location % for 09:00-17:00 (schedule %)', s1, l, sch;
    BEGIN
        PERFORM book_location(s2, l, DATE '2031-03-03', TIME '14:00', TIME '20:00');
        RAISE NOTICE 'UNEXPECTED: the overlapping booking was allowed';
    EXCEPTION WHEN raise_exception THEN
        RAISE NOTICE 'Second booking 14:00-20:00 REJECTED: %', SQLERRM;
    END;
    PERFORM book_location(s2, l, DATE '2031-03-03', TIME '17:00', TIME '20:00');
    RAISE NOTICE 'Back-to-back booking 17:00-20:00 accepted';
END $$;

-- ---------------------------------------------------------------------------------------------
-- DEMO 2  Trigger: equipment damage incident -> MAINTENANCE, and the resource can no longer be booked
-- ---------------------------------------------------------------------------------------------
DO $$
DECLARE p INT; l INT; e INT; s INT; sch INT; st TEXT;
BEGIN
    RAISE NOTICE E'\n=== DEMO 2: damage incident -> maintenance ===';
    SELECT production_id INTO p FROM production WHERE status <> 'CANCELLED' ORDER BY production_id LIMIT 1;
    SELECT location_id INTO l FROM location WHERE status = 'AVAILABLE' ORDER BY location_id LIMIT 1;
    SELECT equipment_id INTO e FROM v_equipment_status WHERE current_status = 'AVAILABLE' ORDER BY equipment_id LIMIT 1;

    SELECT current_status INTO st FROM v_equipment_status WHERE equipment_id = e;
    RAISE NOTICE 'Equipment % status before: %', e, st;

    INSERT INTO incident (type, equipment_id, description) VALUES ('equipment_damage', e, 'DEMO: lens cracked on set');
    SELECT current_status INTO st FROM v_equipment_status WHERE equipment_id = e;
    RAISE NOTICE 'Equipment % status after the damage incident: %', e, st;

    s := pg_temp.demo_scene(p);
    sch := book_location(s, l, DATE '2031-03-04', TIME '09:00', TIME '12:00');
    BEGIN
        PERFORM book_equipment(sch, e);
        RAISE NOTICE 'UNEXPECTED: damaged equipment was booked';
    EXCEPTION WHEN raise_exception THEN
        RAISE NOTICE 'Booking it is REJECTED: %', SQLERRM;
    END;
END $$;

-- ---------------------------------------------------------------------------------------------
-- DEMO 3  Atomicity: a multi-item equipment request with one bad item books NOTHING
-- ---------------------------------------------------------------------------------------------
DO $$
DECLARE p INT; l1 INT; l2 INT; e1 INT; e2 INT; sa INT; sb INT; n INT;
BEGIN
    RAISE NOTICE E'\n=== DEMO 3: transaction rollback ===';
    SELECT production_id INTO p FROM production WHERE status <> 'CANCELLED' ORDER BY production_id LIMIT 1;
    SELECT location_id INTO l1 FROM location WHERE status = 'AVAILABLE' ORDER BY location_id LIMIT 1;
    SELECT location_id INTO l2 FROM location WHERE status = 'AVAILABLE' AND location_id <> l1 ORDER BY location_id LIMIT 1;
    SELECT equipment_id INTO e1 FROM v_equipment_status WHERE current_status = 'AVAILABLE' ORDER BY equipment_id LIMIT 1;
    SELECT equipment_id INTO e2 FROM v_equipment_status WHERE current_status = 'AVAILABLE' AND equipment_id <> e1 ORDER BY equipment_id LIMIT 1;

    sa := book_location(pg_temp.demo_scene(p), l1, DATE '2031-03-05', TIME '09:00', TIME '12:00');
    PERFORM book_equipment(sa, e2);
    RAISE NOTICE 'Production A holds equipment % for 09:00-12:00', e2;

    sb := book_location(pg_temp.demo_scene(p), l2, DATE '2031-03-05', TIME '10:00', TIME '11:00');
    BEGIN
        PERFORM book_equipment(sb, e1);                       -- free: succeeds
        RAISE NOTICE 'Production B: equipment % booked OK ...', e1;
        PERFORM book_equipment(sb, e2);                       -- taken by A: fails
        RAISE NOTICE 'UNEXPECTED: the taken item was booked';
    EXCEPTION WHEN raise_exception THEN
        RAISE NOTICE '... then item % failed: %', e2, SQLERRM;
    END;
    SELECT COUNT(*) INTO n FROM equipment_booking WHERE schedule_id = sb;
    RAISE NOTICE 'Equipment rows left for production B after the failure: % (the whole request was rolled back)', n;
END $$;

-- ---------------------------------------------------------------------------------------------
-- DEMO 4  Trigger: payments move the invoice status, and overpayment is rejected
-- ---------------------------------------------------------------------------------------------
DO $$
DECLARE p INT; inv INT; st TEXT;
BEGIN
    RAISE NOTICE E'\n=== DEMO 4: payments -> invoice status ===';
    SELECT production_id INTO p FROM production WHERE status <> 'CANCELLED' ORDER BY production_id LIMIT 1;
    INSERT INTO invoice (production_id, total_amount, status, issue_date)
    VALUES (p, 1000, 'ISSUED', CURRENT_DATE) RETURNING invoice_id INTO inv;
    RAISE NOTICE 'Invoice % for 1000, status ISSUED', inv;

    INSERT INTO payment (invoice_id, amount, method) VALUES (inv, 400, 'demo');
    SELECT status INTO st FROM invoice WHERE invoice_id = inv;
    RAISE NOTICE 'After paying 400: %', st;

    INSERT INTO payment (invoice_id, amount, method) VALUES (inv, 600, 'demo');
    SELECT status INTO st FROM invoice WHERE invoice_id = inv;
    RAISE NOTICE 'After paying 600 more: %', st;

    BEGIN
        INSERT INTO payment (invoice_id, amount, method) VALUES (inv, 1, 'demo');
        RAISE NOTICE 'UNEXPECTED: overpayment was accepted';
    EXCEPTION WHEN raise_exception THEN
        RAISE NOTICE 'One more payment REJECTED: %', SQLERRM;
    END;
END $$;

-- ---------------------------------------------------------------------------------------------
-- DEMO 5  Trigger: an actor cannot be in two overlapping shoots (fires when a shoot is scheduled)
-- ---------------------------------------------------------------------------------------------
DO $$
DECLARE p INT; l1 INT; l2 INT; a INT; s1 INT; s2 INT;
BEGIN
    RAISE NOTICE E'\n=== DEMO 5: actor clash ===';
    SELECT production_id INTO p FROM production WHERE status <> 'CANCELLED' ORDER BY production_id LIMIT 1;
    SELECT location_id INTO l1 FROM location WHERE status = 'AVAILABLE' ORDER BY location_id LIMIT 1;
    SELECT location_id INTO l2 FROM location WHERE status = 'AVAILABLE' AND location_id <> l1 ORDER BY location_id LIMIT 1;
    INSERT INTO actor (name) VALUES ('DEMO Actor') RETURNING actor_id INTO a;
    s1 := pg_temp.demo_scene(p);  s2 := pg_temp.demo_scene(p);
    INSERT INTO scene_cast (scene_id, actor_id) VALUES (s1, a), (s2, a);
    RAISE NOTICE 'Actor % is cast in scenes % and % (not scheduled yet, so no clash)', a, s1, s2;

    PERFORM book_location(s1, l1, DATE '2031-03-06', TIME '09:00', TIME '11:00');
    RAISE NOTICE 'Scene % scheduled 09:00-11:00', s1;
    BEGIN
        PERFORM book_location(s2, l2, DATE '2031-03-06', TIME '10:00', TIME '12:00');
        RAISE NOTICE 'UNEXPECTED: the overlapping schedule was allowed';
    EXCEPTION WHEN raise_exception THEN
        RAISE NOTICE 'Scene % at 10:00-12:00 REJECTED: %', s2, SQLERRM;
    END;
END $$;

-- ---------------------------------------------------------------------------------------------
-- DEMO 6  Trigger: going over budget is flagged, never blocked
-- ---------------------------------------------------------------------------------------------
DO $$
DECLARE p INT; v INT; n INT;
BEGIN
    RAISE NOTICE E'\n=== DEMO 6: budget exceeded ===';
    SELECT vendor_id INTO v FROM vendor ORDER BY vendor_id LIMIT 1;
    INSERT INTO production (title, type, budget, status)
    VALUES ('DEMO: Tiny Budget Film', 'short_film', 1000, 'PRE_PRODUCTION') RETURNING production_id INTO p;
    RAISE NOTICE 'Production % created with a budget of 1000', p;

    INSERT INTO service_booking (production_id, vendor_id, service_name, start_time, end_time, charge, status)
    VALUES (p, v, 'DEMO: catering', TIMESTAMP '2031-03-07 09:00', TIMESTAMP '2031-03-07 17:00', 5000, 'REQUESTED');
    RAISE NOTICE 'A 5000 service booking was ACCEPTED: total cost is now %', production_total_cost(p);

    BEGIN
        EXECUTE 'SELECT count(*) FROM budget_alert WHERE production_id = $1' INTO n USING p;
        RAISE NOTICE 'Budget alerts raised for this production: %', n;
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Could not read budget_alert (%). Check its column names.', SQLERRM;
    END;
END $$;

ROLLBACK;

-- should be 0: the demos leave nothing behind
SELECT (SELECT count(*) FROM scene WHERE description LIKE 'DEMO:%')
     + (SELECT count(*) FROM actor WHERE name = 'DEMO Actor')
     + (SELECT count(*) FROM production WHERE title LIKE 'DEMO:%') AS leftover_rows;
