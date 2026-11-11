# CineGrid: Master Relational Schema

**Notation Key:**
- <u>Underlined</u>: Primary Key (PK)
- *Italicized*: Foreign Key (FK)

---

### 1. Identity & Roles

**role** (<u>role_id</u>, role_name)
- CHECK (role_name IN ('ADMIN', 'PRODUCTION_MANAGER', 'CREW')).

**users** (<u>user_id</u>, name, email, password_hash, *role_id*, created_at)
- UNIQUE (email).
- `role_id` references `role`.

### 2. People & Parties

**production_house** (<u>house_id</u>, name, contact_info)

**actor** (<u>actor_id</u>, name, contact_info)

**crew_member** (<u>crew_id</u>, name, crew_role, contact_info, *user_id*)
- UNIQUE (user_id).
- `user_id` references `users`.

**vendor** (<u>vendor_id</u>, name, contact_info, vendor_type)
- CHECK (vendor_type IN ('catering', 'transport', 'security', 'costume', 'makeup', 'vfx', 'power', 'props', 'other')).

### 3. Productions & Scenes

**production** (<u>production_id</u>, title, type, *house_id*, *manager_id*, start_date, planned_end_date, budget, status, description, created_at, updated_at)
- `house_id` references `production_house`.
- `manager_id` references `users`.
- CHECK (type IN ('feature_film', 'web_series', 'tv_series', 'ad', 'music_video', 'short_film')).
- CHECK (status IN ('PLANNED', 'PRE_PRODUCTION', 'SHOOTING', 'POST_PRODUCTION', 'COMPLETED', 'CANCELLED')).
- CHECK (planned_end_date >= start_date).

**scene** (<u>scene_id</u>, *production_id*, scene_number, description, required_location_type, planned_duration, priority, status, embedding)
- `production_id` references `production` (ON DELETE CASCADE).
- CHECK (required_location_type IN ('studio', 'sound_stage', 'outdoor', 'backlot', 'set')).
- CHECK (priority IN ('LOW', 'MEDIUM', 'HIGH')).
- CHECK (status IN ('PLANNED', 'SCHEDULED', 'SHOT', 'CANCELLED')).
- UNIQUE (production_id, scene_number).

**scene_cast** (<u>*scene_id*</u>, <u>*actor_id*</u>)
- `scene_id` references `scene` (ON DELETE CASCADE).
- `actor_id` references `actor`.

**scene_crew** (<u>*scene_id*</u>, <u>*crew_id*</u>)
- `scene_id` references `scene` (ON DELETE CASCADE).
- `crew_id` references `crew_member`.

### 4. Resources

**location** (<u>location_id</u>, name, type, capacity, status, rental_price, description, embedding)
- CHECK (type IN ('studio', 'sound_stage', 'outdoor', 'backlot', 'set')).
- CHECK (capacity > 0).
- CHECK (status IN ('AVAILABLE', 'MAINTENANCE', 'UNAVAILABLE')).
- CHECK (rental_price >= 0).
- `embedding` is vector(384).

**equipment** (<u>equipment_id</u>, name, category, serial_number, status, rental_price, description, embedding)
- CHECK (category IN ('camera', 'lighting', 'sound', 'grip', 'other')).
- UNIQUE (serial_number).
- CHECK (status IN ('AVAILABLE', 'MAINTENANCE')).
- CHECK (rental_price >= 0).
- `embedding` is vector(384).

### 5. Scheduling & Bookings

**shooting_schedule** (<u>schedule_id</u>, *scene_id*, *location_id*, shoot_date, start_time, end_time, status, charge, during, *invoice_id*)
- `scene_id` references `scene` (ON DELETE CASCADE).
- `location_id` references `location`.
- `invoice_id` references `invoice`.
- CHECK (status IN ('PLANNED', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED')).
- CHECK (charge >= 0).
- `during` is a GENERATED STORED column: `tsrange(shoot_date + start_time, shoot_date + end_time)`.
- CHECK (end_time > start_time).
- **EXCLUDE CONSTRAINT** `no_location_overlap`: `EXCLUDE USING gist (location_id WITH =, during WITH &&) WHERE (status <> 'CANCELLED')`.

**equipment_booking** (<u>equip_booking_id</u>, *schedule_id*, *equipment_id*, status, charge, during, *invoice_id*)
- `schedule_id` references `shooting_schedule` (ON DELETE CASCADE).
- `equipment_id` references `equipment`.
- `invoice_id` references `invoice`.
- CHECK (status IN ('REQUESTED', 'CONFIRMED', 'CANCELLED')).
- CHECK (charge >= 0).
- `during` is a tsrange copied via trigger.
- **EXCLUDE CONSTRAINT** `no_equipment_overlap`: `EXCLUDE USING gist (equipment_id WITH =, during WITH &&) WHERE (status <> 'CANCELLED')`.

**service_booking** (<u>service_booking_id</u>, *production_id*, *vendor_id*, service_name, start_time, end_time, charge, status, *invoice_id*)
- `production_id` references `production`.
- `vendor_id` references `vendor`.
- `invoice_id` references `invoice`.
- CHECK (status IN ('REQUESTED', 'CONFIRMED', 'COMPLETED', 'CANCELLED')).
- CHECK (charge >= 0).
- CHECK (end_time > start_time).

### 6. Finance

**invoice** (<u>invoice_id</u>, *production_id*, total_amount, status, issue_date)
- `production_id` references `production`.
- CHECK (total_amount >= 0).
- CHECK (status IN ('DRAFT', 'ISSUED', 'PARTIALLY_PAID', 'PAID', 'OVERDUE')).

**payment** (<u>payment_id</u>, *invoice_id*, amount, payment_date, method)
- `invoice_id` references `invoice`.
- CHECK (amount > 0).

### 7. Incidents

**incident** (<u>incident_id</u>, type, *equipment_id*, *location_id*, *reported_by*, description, status, resolution_notes, reported_at, resolved_at)
- `equipment_id` references `equipment`.
- `location_id` references `location`.
- `reported_by` references `users`.
- CHECK (type IN ('equipment_damage', 'location_damage', 'safety', 'operational')).
- CHECK (status IN ('OPEN', 'IN_PROGRESS', 'RESOLVED')).
- CHECK (type <> 'equipment_damage' OR equipment_id IS NOT NULL).
- CHECK (type <> 'location_damage' OR location_id IS NOT NULL).
