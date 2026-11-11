-- CineGrid test_finance.sql : self-contained, everything is rolled back at the end.
-- Any failed ASSERT aborts with an error; PASS lines are printed as NOTICEs.
BEGIN;

DO $$
DECLARE
    pid INT; lid INT; sid INT; eq INT; vid INT;
    sched INT; sched2 INT; inv1 INT; inv2 INT;
    n INT; t NUMERIC; st TEXT;
BEGIN
    INSERT INTO production (title, type, budget, status) VALUES ('ZZ_TEST', 'short_film', 1000, 'SHOOTING') RETURNING production_id INTO pid;
    INSERT INTO location (name, type, rental_price) VALUES ('ZZ_LOC', 'set', 600) RETURNING location_id INTO lid;
    INSERT INTO equipment (name, category, serial_number, rental_price) VALUES ('ZZ_CAM', 'camera', 'ZZ-SN-1', 100) RETURNING equipment_id INTO eq;
    INSERT INTO vendor (name) VALUES ('ZZ_VENDOR') RETURNING vendor_id INTO vid;
    INSERT INTO scene (production_id, scene_number) VALUES (pid, 1) RETURNING scene_id INTO sid;

    -- T1: 600 (location, 1h) + 100 (camera, 1h) = 700 of 1000 -> no alert
    sched := book_location(sid, lid, DATE '2030-01-01', TIME '09:00', TIME '10:00');
    PERFORM book_equipment(sched, eq);
    SELECT count(*) INTO n FROM budget_alert WHERE production_id = pid;
    ASSERT n = 0, 'T1 failed: alert raised while under budget';
    RAISE NOTICE 'PASS T1: no alert at 700 of 1000';

    -- T2: +400 service -> 1100 > 1000 -> open alert, insert NOT blocked
    INSERT INTO service_booking (production_id, vendor_id, service_name, start_time, end_time, charge)
    VALUES (pid, vid, 'Catering', '2030-01-01 12:00', '2030-01-01 14:00', 400);
    SELECT count(*) INTO n FROM budget_alert WHERE production_id = pid AND resolved_at IS NULL AND committed_cost = 1100;
    ASSERT n = 1, 'T2 failed: expected one open alert with cost 1100';
    SELECT count(*) INTO n FROM v_over_budget WHERE production_id = pid AND overrun = 100;
    ASSERT n = 1, 'T2 failed: v_over_budget missing the production';
    RAISE NOTICE 'PASS T2: alert flagged at 1100 of 1000, booking still allowed';

    -- T3: generate_invoice bills all 3 items for 1100 and stamps them
    inv1 := generate_invoice(pid);
    SELECT total_amount, status INTO t, st FROM invoice WHERE invoice_id = inv1;
    ASSERT t = 1100 AND st = 'ISSUED', 'T3 failed: wrong invoice total/status';
    SELECT count(*) INTO n FROM v_invoice_items WHERE invoice_id = inv1;
    ASSERT n = 3, 'T3 failed: expected 3 invoice items';
    RAISE NOTICE 'PASS T3: invoice % = 1100 with 3 items', inv1;

    -- T4: nothing left to bill -> refused with the right message
    BEGIN
        PERFORM generate_invoice(pid);
        ASSERT false, 'T4 failed: second invoice should have been refused';
    EXCEPTION WHEN raise_exception THEN
        ASSERT SQLERRM LIKE 'Nothing to invoice%', 'T4 failed: wrong error: ' || SQLERRM;
        RAISE NOTICE 'PASS T4: second call refused (%)', SQLERRM;
    END;

    -- T5: new booking after invoicing -> only the new item is billed (no double billing)
    sched2 := book_location(sid, lid, DATE '2030-01-02', TIME '09:00', TIME '10:00');
    inv2 := generate_invoice(pid);
    SELECT total_amount INTO t FROM invoice WHERE invoice_id = inv2;
    ASSERT t = 600, 'T5 failed: second invoice should be 600';
    SELECT count(*) INTO n FROM v_invoice_items WHERE invoice_id = inv1;
    ASSERT n = 3, 'T5 failed: first invoice items changed';
    RAISE NOTICE 'PASS T5: invoice % = 600 (only new item)', inv2;

    -- T6: raising the budget auto-resolves the alert
    UPDATE production SET budget = 5000 WHERE production_id = pid;
    SELECT count(*) INTO n FROM budget_alert WHERE production_id = pid AND resolved_at IS NULL;
    ASSERT n = 0, 'T6 failed: alert not resolved after budget increase';
    RAISE NOTICE 'PASS T6: alert resolved after budget raised';

    -- T7: payment trigger still works with generated invoices
    INSERT INTO payment (invoice_id, amount, method) VALUES (inv1, 1100, 'bank');
    SELECT status INTO st FROM invoice WHERE invoice_id = inv1;
    ASSERT st = 'PAID', 'T7 failed: invoice not PAID';
    RAISE NOTICE 'PASS T7: invoice % is PAID', inv1;

    -- T8: cancelling bookings lowers the cost and resolves the alert
    UPDATE production SET budget = 1000 WHERE production_id = pid;          -- cost is 1700 -> alert opens
    SELECT count(*) INTO n FROM budget_alert WHERE production_id = pid AND resolved_at IS NULL AND committed_cost = 1700;
    ASSERT n = 1, 'T8 failed: alert should open at 1700 of 1000';
    UPDATE shooting_schedule SET status = 'CANCELLED' WHERE schedule_id = sched2;   -- cost 1100, still over
    SELECT count(*) INTO n FROM budget_alert WHERE production_id = pid AND resolved_at IS NULL AND committed_cost = 1100;
    ASSERT n = 1, 'T8 failed: alert should update to 1100';
    UPDATE service_booking SET status = 'CANCELLED' WHERE production_id = pid;      -- cost 700, back under
    SELECT count(*) INTO n FROM budget_alert WHERE production_id = pid AND resolved_at IS NULL;
    ASSERT n = 0, 'T8 failed: alert should resolve at 700 of 1000';
    RAISE NOTICE 'PASS T8: cancellations update and resolve the alert';

    -- T9: clearing the budget resolves an open alert
    UPDATE production SET budget = 500 WHERE production_id = pid;           -- 700 > 500 -> opens
    UPDATE production SET budget = NULL WHERE production_id = pid;
    SELECT count(*) INTO n FROM budget_alert WHERE production_id = pid AND resolved_at IS NULL;
    ASSERT n = 0, 'T9 failed: alert should resolve when budget is cleared';
    RAISE NOTICE 'PASS T9: alert resolved when budget cleared';

    -- T10: missing production
    BEGIN
        PERFORM generate_invoice(-1);
        ASSERT false, 'T10 failed: missing production should have been refused';
    EXCEPTION WHEN raise_exception THEN
        ASSERT SQLERRM LIKE 'Production % not found', 'T10 failed: wrong error: ' || SQLERRM;
        RAISE NOTICE 'PASS T10: missing production refused';
    END;

    RAISE NOTICE 'ALL FINANCE TESTS PASSED';
END $$;

ROLLBACK;
