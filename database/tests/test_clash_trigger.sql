-- Clash trigger test. Run from the repo root:
--   docker exec -i cinegrid-db psql -U cinegrid -d cinegrid -v ON_ERROR_STOP=1 < database/tests/test_clash_trigger.sql
-- Everything happens inside one transaction that is rolled back, so no data is left behind.
BEGIN;
DO $$
DECLARE
    p INT; n INT; a INT; c INT;
    s1 INT; s2 INT; s3 INT; s4 INT;
    l1 INT; l2 INT;
    sch1 INT; sch2 INT; sch3 INT;
BEGIN
    SELECT production_id INTO p FROM production ORDER BY production_id LIMIT 1;
    SELECT location_id INTO l1 FROM location WHERE status = 'AVAILABLE' ORDER BY location_id LIMIT 1;
    SELECT location_id INTO l2 FROM location WHERE status = 'AVAILABLE' AND location_id <> l1 ORDER BY location_id LIMIT 1;
    SELECT COALESCE(MAX(scene_number), 0) INTO n FROM scene WHERE production_id = p;

    INSERT INTO actor (name) VALUES ('Clash Test Actor') RETURNING actor_id INTO a;
    INSERT INTO crew_member (name, crew_role) VALUES ('Clash Test Crew', 'tester') RETURNING crew_id INTO c;

    INSERT INTO scene (production_id, scene_number, description, required_location_type, planned_duration, priority, status)
    VALUES (p, n + 1, 'clash test 1', 'studio', 60, 'MEDIUM', 'PLANNED') RETURNING scene_id INTO s1;
    INSERT INTO scene (production_id, scene_number, description, required_location_type, planned_duration, priority, status)
    VALUES (p, n + 2, 'clash test 2', 'studio', 60, 'MEDIUM', 'PLANNED') RETURNING scene_id INTO s2;
    INSERT INTO scene (production_id, scene_number, description, required_location_type, planned_duration, priority, status)
    VALUES (p, n + 3, 'clash test 3', 'studio', 60, 'MEDIUM', 'PLANNED') RETURNING scene_id INTO s3;
    INSERT INTO scene (production_id, scene_number, description, required_location_type, planned_duration, priority, status)
    VALUES (p, n + 4, 'clash test 4', 'studio', 60, 'MEDIUM', 'PLANNED') RETURNING scene_id INTO s4;

    INSERT INTO scene_cast (scene_id, actor_id) VALUES (s1, a), (s2, a);
    INSERT INTO scene_crew (scene_id, crew_id) VALUES (s3, c), (s4, c);

    sch1 := book_location(s1, l1, DATE '2030-01-01', TIME '09:00', TIME '11:00');

    -- 1. overlapping booking for the same actor must be rejected
    BEGIN
        PERFORM book_location(s2, l2, DATE '2030-01-01', TIME '10:00', TIME '12:00');
        RAISE NOTICE 'FAIL 1: overlapping actor booking was allowed';
    EXCEPTION WHEN raise_exception THEN
        IF SQLERRM LIKE 'Actor%overlapping scene%' THEN
            RAISE NOTICE 'PASS 1: % ', SQLERRM;
        ELSE
            RAISE NOTICE 'FAIL 1: unexpected error: %', SQLERRM;
        END IF;
    END;

    -- 2. a non-overlapping booking for the same actor must be allowed
    sch2 := book_location(s2, l2, DATE '2030-01-01', TIME '12:00', TIME '13:00');
    RAISE NOTICE 'PASS 2: non-overlapping booking allowed (schedule %)', sch2;

    -- 3. moving that shoot into the overlap must be rejected
    BEGIN
        UPDATE shooting_schedule SET start_time = TIME '10:00', end_time = TIME '12:00' WHERE schedule_id = sch2;
        RAISE NOTICE 'FAIL 3: moving into an overlap was allowed';
    EXCEPTION WHEN raise_exception THEN
        IF SQLERRM LIKE 'Actor%overlapping scene%' THEN
            RAISE NOTICE 'PASS 3: % ', SQLERRM;
        ELSE
            RAISE NOTICE 'FAIL 3: unexpected error: %', SQLERRM;
        END IF;
    END;

    -- 4. a CANCELLED shoot does not count: cancel the first one, then the move is fine
    UPDATE shooting_schedule SET status = 'CANCELLED' WHERE schedule_id = sch1;
    BEGIN
        UPDATE shooting_schedule SET start_time = TIME '10:00', end_time = TIME '12:00' WHERE schedule_id = sch2;
        RAISE NOTICE 'PASS 4: cancelled shoot ignored';
    EXCEPTION WHEN raise_exception THEN
        RAISE NOTICE 'FAIL 4: %', SQLERRM;
    END;

    -- 5. same rule for crew
    sch3 := book_location(s3, l1, DATE '2030-01-02', TIME '09:00', TIME '11:00');
    BEGIN
        PERFORM book_location(s4, l2, DATE '2030-01-02', TIME '10:00', TIME '12:00');
        RAISE NOTICE 'FAIL 5: overlapping crew booking was allowed';
    EXCEPTION WHEN raise_exception THEN
        IF SQLERRM LIKE 'Crew member%overlapping scene%' THEN
            RAISE NOTICE 'PASS 5: % ', SQLERRM;
        ELSE
            RAISE NOTICE 'FAIL 5: unexpected error: %', SQLERRM;
        END IF;
    END;
END $$;
ROLLBACK;

-- should be 0: the test leaves nothing behind
SELECT count(*) AS leftover_rows FROM actor WHERE name = 'Clash Test Actor';
