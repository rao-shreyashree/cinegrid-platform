# CineGrid: DDL & Database Object Listing

This document provides a master index of all Data Definition Language (DDL) scripts and database objects in the CineGrid platform. 

## Script Execution Order
The DDL scripts are designed to be run in alphabetical order on a fresh database. Docker automatically mounts and executes them in this sequence via the `/docker-entrypoint-initdb.d` directory.

| File | Purpose |
| :--- | :--- |
| `01_schema.sql` | Extensions, tables, constraints, and indexes. |
| `02_functions.sql` | Stored procedures and functions for business logic. |
| `03_triggers.sql` | Triggers for automated data integrity and state management. |
| `04_views.sql` | Views for simplified data retrieval and analytics. |
| `05_finance.sql` | Additional finance functions, views, and triggers (Shreya's module). |

---

## 1. Tables (Defined in `01_schema.sql`)
The schema consists of 18 tables, created in strict dependency order to satisfy foreign keys:

**Core Entities:**
- `role`, `users`
- `production_house`, `actor`, `crew_member`, `vendor`
- `production`, `scene`, `scene_cast`, `scene_crew`

**Resources & Scheduling:**
- `location`, `equipment`
- `shooting_schedule`, `equipment_booking`, `service_booking`

**Finance & Operations:**
- `invoice`, `payment`, `incident`

## 2. Functions (Defined in `02_functions.sql` and `05_finance.sql`)
| Function | Returns | Description |
| :--- | :--- | :--- |
| `range_hours(r tsrange)` | `NUMERIC` | Calculates the total hours covered by a time range. Used to compute rental charges. |
| `book_location(...)` | `INT` | Validates availability, locks the row `FOR UPDATE`, calculates cost, and inserts a schedule. Catches exclusion violations. |
| `book_equipment(...)` | `INT` | Validates maintenance status, computes cost based on schedule duration, and inserts a booking. |
| `production_total_cost(...)` | `NUMERIC` | Aggregates location charges, equipment charges, and service charges for a production. |
| `generate_invoice(...)` | `INT` | Locks unbilled schedules/bookings, creates an invoice, and calculates the total. (Finance Module) |

## 3. Triggers (Defined in `03_triggers.sql` and `05_finance.sql`)
| Trigger | Table | Action |
| :--- | :--- | :--- |
| `trg_equip_booking_set_during` | `equipment_booking` | **BEFORE INSERT.** Copies the `during` tsrange from the `shooting_schedule` to prevent overlap conflicts. |
| `trg_schedule_sync_equipment` | `shooting_schedule` | **AFTER UPDATE.** If a shoot is cancelled, cancels its equipment bookings. If rescheduled, updates the equipment booking times. |
| `trg_incident_maintenance` | `incident` | **AFTER INSERT.** Automatically flags equipment or locations as `MAINTENANCE` when a damage incident is reported. |
| `trg_incident_resolve` | `incident` | **BEFORE UPDATE.** If an incident is resolved, and no other open incidents exist, restores the item to `AVAILABLE`. |
| `trg_payment_update_invoice` | `payment` | **AFTER INSERT/UPDATE/DELETE.** Recalculates invoice status (`PAID`, `PARTIALLY_PAID`), rejecting overpayments. |
| `trg_production_updated_at` | `production` | **BEFORE UPDATE.** Automatically stamps `updated_at` with `CURRENT_TIMESTAMP`. |
| `trg_cast_clash` | `scene_cast` | **BEFORE INSERT.** Prevents an actor from being scheduled in two overlapping shoots. |
| `trg_crew_clash` | `scene_crew` | **BEFORE INSERT.** Prevents a crew member from being scheduled in two overlapping shoots. |
| `trg_schedule_clash` | `shooting_schedule` | **AFTER INSERT/UPDATE.** (Added in `feat/db-clash-trigger`). Prevents scheduling a scene if its cast/crew are already booked. |

## 4. Views (Defined in `04_views.sql` and `05_finance.sql`)
| View | Description |
| :--- | :--- |
| `v_active_productions` | Filters productions to show only those currently in active phases (`PRE_PRODUCTION`, `SHOOTING`, `POST_PRODUCTION`). |
| `v_daily_schedule` | Joins schedules to locations, scenes, and productions for the daily calendar view. |
| `v_location_utilization` | Aggregates total bookings and booked hours per location. |
| `v_equipment_utilization` | Aggregates total bookings and booked hours per equipment item. |
| `v_production_cost` | Calculates total cost, invoiced amount, paid amount, and outstanding balance per production. |
| `v_equipment_status` | Computes dynamic status: `MAINTENANCE` overrides; `IN_USE` if currently booked; else `AVAILABLE`. |
| `v_invoice_items` | Aggregates individual booking charges (location, equipment, service) linked to a specific invoice. (Finance Module) |

## 5. Indexes
- **B-Tree Indexes:** Applied to foreign keys and frequently filtered columns (e.g., `production(status)`, `shooting_schedule(shoot_date)`).
- **GiST Indexes:** Created automatically by the two `EXCLUDE` constraints (`no_location_overlap`, `no_equipment_overlap`) to enforce time-range overlap prevention.
- **HNSW Indexes:** `idx_location_embedding`, `idx_scene_embedding`, `idx_equipment_embedding`. Used for fast cosine distance calculations in the semantic search vector queries.
