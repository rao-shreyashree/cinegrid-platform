-- CineGrid 01_schema.sql : extensions, tables, constraints, indexes
-- Tables are created in dependency order.

CREATE EXTENSION IF NOT EXISTS vector;      -- pgvector
CREATE EXTENSION IF NOT EXISTS btree_gist;  -- needed for EXCLUDE (equality + range overlap)

-- ---------- Identity ----------
CREATE TABLE role (
    role_id    INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    role_name  VARCHAR(255) NOT NULL UNIQUE
);

CREATE TABLE users (
    user_id        INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name           VARCHAR(255) NOT NULL,
    email          VARCHAR(255) NOT NULL UNIQUE,
    password_hash  VARCHAR(255) NOT NULL,
    role_id        INT NOT NULL REFERENCES role(role_id),
    created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ---------- People / parties ----------
CREATE TABLE production_house (
    house_id      INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name          VARCHAR(255) NOT NULL,
    contact_info  VARCHAR(255)
);

CREATE TABLE actor (
    actor_id      INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name          VARCHAR(255) NOT NULL,
    contact_info  VARCHAR(255)
);

CREATE TABLE crew_member (
    crew_id       INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name          VARCHAR(255) NOT NULL,
    crew_role     VARCHAR(255),
    contact_info  VARCHAR(255),
    user_id       INT UNIQUE REFERENCES users(user_id)   -- lets a Crew user log in and see own work
);

CREATE TABLE vendor (
    vendor_id     INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name          VARCHAR(255) NOT NULL,
    contact_info  VARCHAR(255)
);

-- ---------- Resources ----------
CREATE TABLE location (
    location_id   INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name          VARCHAR(255) NOT NULL,
    type          VARCHAR(255) NOT NULL
                  CHECK (type IN ('studio','sound_stage','outdoor','backlot','set')),
    capacity      INT CHECK (capacity > 0),
    status        VARCHAR(255) NOT NULL DEFAULT 'AVAILABLE'
                  CHECK (status IN ('AVAILABLE','MAINTENANCE','UNAVAILABLE')),
    rental_price  DECIMAL(12,2) NOT NULL DEFAULT 0 CHECK (rental_price >= 0),  -- per hour
    description   TEXT,
    embedding     vector(384)
);

CREATE TABLE equipment (
    equipment_id   INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name           VARCHAR(255) NOT NULL,
    category       VARCHAR(255) NOT NULL
                   CHECK (category IN ('camera','lighting','sound','grip','other')),
    serial_number  VARCHAR(255) NOT NULL UNIQUE,
    status         VARCHAR(255) NOT NULL DEFAULT 'AVAILABLE'
                   CHECK (status IN ('AVAILABLE','IN_USE','MAINTENANCE')),
    rental_price   DECIMAL(12,2) NOT NULL DEFAULT 0 CHECK (rental_price >= 0), -- per hour
    description    TEXT,
    embedding      vector(384)
);

-- ---------- Production ----------
CREATE TABLE production (
    production_id     INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    title             VARCHAR(255) NOT NULL,
    type              VARCHAR(255) NOT NULL
                      CHECK (type IN ('feature_film','web_series','tv_series','ad','music_video','short_film')),
    house_id          INT REFERENCES production_house(house_id),
    manager_id        INT REFERENCES users(user_id),
    start_date        DATE,
    planned_end_date  DATE,
    budget            DECIMAL(12,2) CHECK (budget >= 0),
    status            VARCHAR(255) NOT NULL DEFAULT 'PLANNED'
                      CHECK (status IN ('PLANNED','PRE_PRODUCTION','SHOOTING','POST_PRODUCTION','COMPLETED','CANCELLED')),
    description       TEXT,
    created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at        TIMESTAMP,
    CHECK (planned_end_date IS NULL OR start_date IS NULL OR planned_end_date >= start_date)
);

CREATE TABLE scene (
    scene_id                INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    production_id           INT NOT NULL REFERENCES production(production_id) ON DELETE CASCADE,
    scene_number            INT NOT NULL,
    description             TEXT,
    required_location_type  VARCHAR(255),
    planned_duration        INT CHECK (planned_duration > 0),   -- minutes
    priority                VARCHAR(255) CHECK (priority IN ('LOW','MEDIUM','HIGH')),
    status                  VARCHAR(255) NOT NULL DEFAULT 'PLANNED'
                            CHECK (status IN ('PLANNED','SCHEDULED','SHOT','CANCELLED')),
    embedding               vector(384),
    UNIQUE (production_id, scene_number)
);

CREATE TABLE scene_cast (
    scene_id  INT REFERENCES scene(scene_id) ON DELETE CASCADE,
    actor_id  INT REFERENCES actor(actor_id),
    PRIMARY KEY (scene_id, actor_id)
);

CREATE TABLE scene_crew (
    scene_id  INT REFERENCES scene(scene_id) ON DELETE CASCADE,
    crew_id   INT REFERENCES crew_member(crew_id),
    PRIMARY KEY (scene_id, crew_id)
);

-- ---------- Scheduling & bookings ----------
CREATE TABLE shooting_schedule (
    schedule_id  INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    scene_id     INT NOT NULL REFERENCES scene(scene_id) ON DELETE CASCADE,
    location_id  INT NOT NULL REFERENCES location(location_id),
    shoot_date   DATE NOT NULL,
    start_time   TIME NOT NULL,
    end_time     TIME NOT NULL,
    status       VARCHAR(255) NOT NULL DEFAULT 'PLANNED'
                 CHECK (status IN ('PLANNED','CONFIRMED','IN_PROGRESS','COMPLETED','CANCELLED')),
    charge       DECIMAL(12,2) NOT NULL DEFAULT 0 CHECK (charge >= 0),
    during       tsrange GENERATED ALWAYS AS
                 (tsrange(shoot_date + start_time, shoot_date + end_time)) STORED,
    CHECK (end_time > start_time),
    -- DB-level double-booking prevention for locations
    CONSTRAINT no_location_overlap
        EXCLUDE USING gist (location_id WITH =, during WITH &&)
        WHERE (status <> 'CANCELLED')
);

CREATE TABLE equipment_booking (
    equip_booking_id  INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    schedule_id       INT NOT NULL REFERENCES shooting_schedule(schedule_id) ON DELETE CASCADE,
    equipment_id      INT NOT NULL REFERENCES equipment(equipment_id),
    status            VARCHAR(255) NOT NULL DEFAULT 'CONFIRMED'
                      CHECK (status IN ('REQUESTED','CONFIRMED','CANCELLED')),
    charge            DECIMAL(12,2) NOT NULL DEFAULT 0 CHECK (charge >= 0),
    during            tsrange,   -- copied from shooting_schedule by trigger (see 03_triggers.sql)
    CONSTRAINT no_equipment_overlap
        EXCLUDE USING gist (equipment_id WITH =, during WITH &&)
        WHERE (status <> 'CANCELLED'),
    UNIQUE (schedule_id, equipment_id)
);

CREATE TABLE service_booking (
    service_booking_id  INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    production_id       INT NOT NULL REFERENCES production(production_id),
    vendor_id           INT NOT NULL REFERENCES vendor(vendor_id),
    service_name        VARCHAR(255) NOT NULL,
    start_time          TIMESTAMP NOT NULL,
    end_time            TIMESTAMP NOT NULL,
    charge              DECIMAL(12,2) NOT NULL DEFAULT 0 CHECK (charge >= 0),
    status              VARCHAR(255) NOT NULL DEFAULT 'REQUESTED'
                        CHECK (status IN ('REQUESTED','CONFIRMED','COMPLETED','CANCELLED')),
    CHECK (end_time > start_time)
);

-- ---------- Finance ----------
CREATE TABLE invoice (
    invoice_id     INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    production_id  INT NOT NULL REFERENCES production(production_id),
    total_amount   DECIMAL(12,2) NOT NULL CHECK (total_amount >= 0),
    status         VARCHAR(255) NOT NULL DEFAULT 'DRAFT'
                   CHECK (status IN ('DRAFT','ISSUED','PARTIALLY_PAID','PAID','OVERDUE')),
    issue_date     DATE
);

CREATE TABLE payment (
    payment_id    INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    invoice_id    INT NOT NULL REFERENCES invoice(invoice_id),
    amount        DECIMAL(12,2) NOT NULL CHECK (amount > 0),
    payment_date  DATE NOT NULL DEFAULT CURRENT_DATE,
    method        VARCHAR(255)
);

-- ---------- Incidents ----------
CREATE TABLE incident (
    incident_id       INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    type              VARCHAR(255) NOT NULL
                      CHECK (type IN ('equipment_damage','location_damage','safety','operational')),
    equipment_id      INT REFERENCES equipment(equipment_id),
    location_id       INT REFERENCES location(location_id),
    reported_by       INT REFERENCES users(user_id),
    description       TEXT,
    status            VARCHAR(255) NOT NULL DEFAULT 'OPEN'
                      CHECK (status IN ('OPEN','IN_PROGRESS','RESOLVED')),
    resolution_notes  TEXT,
    reported_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    resolved_at       TIMESTAMP,
    CHECK (type <> 'equipment_damage' OR equipment_id IS NOT NULL),
    CHECK (type <> 'location_damage'  OR location_id  IS NOT NULL)
);

-- ---------- Indexes (justified by query patterns) ----------
CREATE INDEX idx_production_status      ON production(status);
CREATE INDEX idx_production_house       ON production(house_id);
CREATE INDEX idx_scene_production       ON scene(production_id);
CREATE INDEX idx_schedule_date          ON shooting_schedule(shoot_date);       -- daily schedule view
CREATE INDEX idx_schedule_scene         ON shooting_schedule(scene_id);
CREATE INDEX idx_equipment_category     ON equipment(category, status);         -- inventory filters
CREATE INDEX idx_equip_booking_sched    ON equipment_booking(schedule_id);
CREATE INDEX idx_service_booking_prod   ON service_booking(production_id);
CREATE INDEX idx_invoice_production     ON invoice(production_id);
CREATE INDEX idx_payment_invoice        ON payment(invoice_id);

-- Vector indexes (cosine distance)
CREATE INDEX idx_location_embedding  ON location  USING hnsw (embedding vector_cosine_ops);
CREATE INDEX idx_scene_embedding     ON scene     USING hnsw (embedding vector_cosine_ops);
CREATE INDEX idx_equipment_embedding ON equipment USING hnsw (embedding vector_cosine_ops);
