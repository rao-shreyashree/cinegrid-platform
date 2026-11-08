-- CineGrid 02_functions.sql : stored functions
-- Each function call runs inside one transaction: if anything raises, everything rolls back.

-- Hours covered by a tsrange
CREATE OR REPLACE FUNCTION range_hours(r tsrange) RETURNS NUMERIC AS $$
    SELECT EXTRACT(EPOCH FROM (upper(r) - lower(r))) / 3600.0;
$$ LANGUAGE sql IMMUTABLE;

-- book_location: validate, compute charge, insert schedule row.
-- Overlap is enforced by the no_location_overlap exclusion constraint; we turn it into a clear message.
CREATE OR REPLACE FUNCTION book_location(
    p_scene_id    INT,
    p_location_id INT,
    p_date        DATE,
    p_start       TIME,
    p_end         TIME
) RETURNS INT AS $$
DECLARE
    v_loc      location%ROWTYPE;
    v_hours    NUMERIC;
    v_id       INT;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM scene WHERE scene_id = p_scene_id AND status <> 'CANCELLED') THEN
        RAISE EXCEPTION 'Scene % not found or cancelled', p_scene_id;
    END IF;

    -- Lock the location row so concurrent bookings serialize
    SELECT * INTO v_loc FROM location WHERE location_id = p_location_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Location % not found', p_location_id;
    END IF;
    IF v_loc.status <> 'AVAILABLE' THEN
        RAISE EXCEPTION 'Location "%" is not available (status: %)', v_loc.name, v_loc.status;
    END IF;
    IF p_end <= p_start THEN
        RAISE EXCEPTION 'End time must be after start time';
    END IF;

    v_hours := EXTRACT(EPOCH FROM (p_end - p_start)) / 3600.0;

    BEGIN
        INSERT INTO shooting_schedule (scene_id, location_id, shoot_date, start_time, end_time, charge)
        VALUES (p_scene_id, p_location_id, p_date, p_start, p_end, ROUND(v_loc.rental_price * v_hours, 2))
        RETURNING schedule_id INTO v_id;
    EXCEPTION WHEN exclusion_violation THEN
        RAISE EXCEPTION 'Resource conflict detected: "%" is already booked for that time', v_loc.name;
    END;

    UPDATE scene SET status = 'SCHEDULED' WHERE scene_id = p_scene_id AND status = 'PLANNED';
    RETURN v_id;
END;
$$ LANGUAGE plpgsql;

-- book_equipment: attach equipment to an existing schedule slot
CREATE OR REPLACE FUNCTION book_equipment(
    p_schedule_id  INT,
    p_equipment_id INT
) RETURNS INT AS $$
DECLARE
    v_eq     equipment%ROWTYPE;
    v_sched  shooting_schedule%ROWTYPE;
    v_id     INT;
BEGIN
    SELECT * INTO v_sched FROM shooting_schedule WHERE schedule_id = p_schedule_id;
    IF NOT FOUND OR v_sched.status = 'CANCELLED' THEN
        RAISE EXCEPTION 'Schedule % not found or cancelled', p_schedule_id;
    END IF;

    SELECT * INTO v_eq FROM equipment WHERE equipment_id = p_equipment_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Equipment % not found', p_equipment_id;
    END IF;
    IF v_eq.status = 'MAINTENANCE' THEN
        RAISE EXCEPTION 'Equipment "%" is under maintenance', v_eq.name;
    END IF;

    BEGIN
        INSERT INTO equipment_booking (schedule_id, equipment_id, charge)
        VALUES (p_schedule_id, p_equipment_id, ROUND(v_eq.rental_price * range_hours(v_sched.during), 2))
        RETURNING equip_booking_id INTO v_id;
    EXCEPTION
        WHEN exclusion_violation THEN
            RAISE EXCEPTION 'Resource conflict detected: "%" is already booked for that time', v_eq.name;
        WHEN unique_violation THEN
            RAISE EXCEPTION '"%" is already booked on this schedule', v_eq.name;
    END;

    RETURN v_id;
END;
$$ LANGUAGE plpgsql;

-- Total spend of a production (locations + equipment + services, excluding cancelled)
CREATE OR REPLACE FUNCTION production_total_cost(p_production_id INT) RETURNS NUMERIC AS $$
    SELECT
      COALESCE((SELECT SUM(ss.charge) FROM shooting_schedule ss
                JOIN scene s ON s.scene_id = ss.scene_id
                WHERE s.production_id = p_production_id AND ss.status <> 'CANCELLED'), 0)
    + COALESCE((SELECT SUM(eb.charge) FROM equipment_booking eb
                JOIN shooting_schedule ss ON ss.schedule_id = eb.schedule_id
                JOIN scene s ON s.scene_id = ss.scene_id
                WHERE s.production_id = p_production_id AND eb.status <> 'CANCELLED'), 0)
    + COALESCE((SELECT SUM(sb.charge) FROM service_booking sb
                WHERE sb.production_id = p_production_id AND sb.status <> 'CANCELLED'), 0);
$$ LANGUAGE sql STABLE;
