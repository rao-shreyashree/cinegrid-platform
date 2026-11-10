-- CineGrid 03_triggers.sql

-- 1. Copy time range from schedule into equipment_booking (needed for the EXCLUDE constraint)
CREATE OR REPLACE FUNCTION fn_equip_booking_set_during() RETURNS trigger AS $$
BEGIN
    SELECT during INTO NEW.during FROM shooting_schedule WHERE schedule_id = NEW.schedule_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_equip_booking_set_during
BEFORE INSERT ON equipment_booking
FOR EACH ROW EXECUTE FUNCTION fn_equip_booking_set_during();

-- 2. Keep equipment bookings in sync when a schedule is rescheduled or cancelled
CREATE OR REPLACE FUNCTION fn_schedule_sync_equipment() RETURNS trigger AS $$
BEGIN
    IF NEW.status = 'CANCELLED' THEN
        UPDATE equipment_booking SET status = 'CANCELLED' WHERE schedule_id = NEW.schedule_id;
    ELSIF NEW.during IS DISTINCT FROM OLD.during THEN
        UPDATE equipment_booking SET during = NEW.during WHERE schedule_id = NEW.schedule_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_schedule_sync_equipment
AFTER UPDATE ON shooting_schedule
FOR EACH ROW EXECUTE FUNCTION fn_schedule_sync_equipment();

-- 3. Damage incident -> MAINTENANCE
CREATE OR REPLACE FUNCTION fn_incident_maintenance() RETURNS trigger AS $$
BEGIN
    IF NEW.type = 'equipment_damage' THEN
        UPDATE equipment SET status = 'MAINTENANCE' WHERE equipment_id = NEW.equipment_id;
    ELSIF NEW.type = 'location_damage' THEN
        UPDATE location SET status = 'MAINTENANCE' WHERE location_id = NEW.location_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_incident_maintenance
AFTER INSERT ON incident
FOR EACH ROW EXECUTE FUNCTION fn_incident_maintenance();

-- 4. Payments -> invoice status (PARTIALLY_PAID / PAID)
CREATE OR REPLACE FUNCTION fn_payment_update_invoice() RETURNS trigger AS $$
DECLARE
    v_inv   INT := COALESCE(NEW.invoice_id, OLD.invoice_id);
    v_paid  NUMERIC;
    v_total NUMERIC;
    v_status TEXT;
BEGIN
    SELECT total_amount, status INTO v_total, v_status FROM invoice WHERE invoice_id = v_inv FOR UPDATE;
    IF v_status = 'DRAFT' THEN
        RAISE EXCEPTION 'Cannot record a payment against a DRAFT invoice';
    END IF;
    SELECT COALESCE(SUM(amount), 0) INTO v_paid FROM payment WHERE invoice_id = v_inv;
    IF v_paid > v_total THEN
        RAISE EXCEPTION 'Payments (%) exceed invoice total (%)', v_paid, v_total;
    END IF;

    UPDATE invoice SET status =
        CASE WHEN v_paid >= v_total THEN 'PAID'
             WHEN v_paid > 0        THEN 'PARTIALLY_PAID'
             ELSE 'ISSUED' END
    WHERE invoice_id = v_inv;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_payment_update_invoice
AFTER INSERT OR UPDATE OR DELETE ON payment
FOR EACH ROW EXECUTE FUNCTION fn_payment_update_invoice();

-- 5. production.updated_at
CREATE OR REPLACE FUNCTION fn_touch_updated_at() RETURNS trigger AS $$
BEGIN
    NEW.updated_at := CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_production_updated_at
BEFORE UPDATE ON production
FOR EACH ROW EXECUTE FUNCTION fn_touch_updated_at();

-- 6. Actor / crew double-booking across productions
CREATE OR REPLACE FUNCTION fn_cast_clash() RETURNS trigger AS $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM shooting_schedule mine
        JOIN shooting_schedule other
          ON other.during && mine.during AND other.scene_id <> mine.scene_id
        JOIN scene_cast sc ON sc.scene_id = other.scene_id AND sc.actor_id = NEW.actor_id
        WHERE mine.scene_id = NEW.scene_id
          AND mine.status <> 'CANCELLED' AND other.status <> 'CANCELLED'
    ) THEN
        RAISE EXCEPTION 'Actor % is already scheduled in an overlapping scene', NEW.actor_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_cast_clash
BEFORE INSERT ON scene_cast
FOR EACH ROW EXECUTE FUNCTION fn_cast_clash();

CREATE OR REPLACE FUNCTION fn_crew_clash() RETURNS trigger AS $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM shooting_schedule mine
        JOIN shooting_schedule other
          ON other.during && mine.during AND other.scene_id <> mine.scene_id
        JOIN scene_crew sc ON sc.scene_id = other.scene_id AND sc.crew_id = NEW.crew_id
        WHERE mine.scene_id = NEW.scene_id
          AND mine.status <> 'CANCELLED' AND other.status <> 'CANCELLED'
    ) THEN
        RAISE EXCEPTION 'Crew member % is already scheduled in an overlapping scene', NEW.crew_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_crew_clash
BEFORE INSERT ON scene_crew
FOR EACH ROW EXECUTE FUNCTION fn_crew_clash();

-- 7. Resolving an incident: stamp resolved_at, restore the item if no other open damage incident
CREATE OR REPLACE FUNCTION fn_incident_resolve() RETURNS trigger AS $$
BEGIN
    IF NEW.status = 'RESOLVED' AND OLD.status <> 'RESOLVED' THEN
        NEW.resolved_at := COALESCE(NEW.resolved_at, CURRENT_TIMESTAMP);

        IF NEW.type = 'equipment_damage' AND NOT EXISTS (
               SELECT 1 FROM incident
                WHERE equipment_id = NEW.equipment_id AND type = 'equipment_damage'
                  AND status <> 'RESOLVED' AND incident_id <> NEW.incident_id) THEN
            UPDATE equipment SET status = 'AVAILABLE'
             WHERE equipment_id = NEW.equipment_id AND status = 'MAINTENANCE';
        ELSIF NEW.type = 'location_damage' AND NOT EXISTS (
               SELECT 1 FROM incident
                WHERE location_id = NEW.location_id AND type = 'location_damage'
                  AND status <> 'RESOLVED' AND incident_id <> NEW.incident_id) THEN
            UPDATE location SET status = 'AVAILABLE'
             WHERE location_id = NEW.location_id AND status = 'MAINTENANCE';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_incident_resolve
BEFORE UPDATE ON incident
FOR EACH ROW EXECUTE FUNCTION fn_incident_resolve();