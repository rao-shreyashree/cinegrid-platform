# CineGrid ER diagram

Generated from the live PostgreSQL schema by `node scripts/gen_erd.mjs`. Do not edit by hand: re-run after any schema change.

```mermaid
erDiagram
    actor {
        int actor_id PK
        varchar name
        varchar contact_info
    }
    budget_alert {
        int alert_id PK
        int production_id FK
        numeric budget
        numeric committed_cost
        timestamp raised_at
        timestamp updated_at
        timestamp resolved_at
    }
    crew_member {
        int crew_id PK
        varchar name
        varchar crew_role
        varchar contact_info
        int user_id FK, UK
    }
    equipment {
        int equipment_id PK
        varchar name
        varchar category
        varchar serial_number UK
        varchar status
        numeric rental_price
        text description
        vector embedding
    }
    equipment_booking {
        int equip_booking_id PK
        int schedule_id FK
        int equipment_id FK
        varchar status
        numeric charge
        tsrange during
        int invoice_id FK
    }
    incident {
        int incident_id PK
        varchar type
        int equipment_id FK
        int location_id FK
        int reported_by FK
        text description
        varchar status
        text resolution_notes
        timestamp reported_at
        timestamp resolved_at
    }
    invoice {
        int invoice_id PK
        int production_id FK
        numeric total_amount
        varchar status
        date issue_date
    }
    location {
        int location_id PK
        varchar name
        varchar type
        int capacity
        varchar status
        numeric rental_price
        text description
        vector embedding
    }
    payment {
        int payment_id PK
        int invoice_id FK
        numeric amount
        date payment_date
        varchar method
    }
    production {
        int production_id PK
        varchar title
        varchar type
        int house_id FK
        int manager_id FK
        date start_date
        date planned_end_date
        numeric budget
        varchar status
        text description
        timestamp created_at
        timestamp updated_at
    }
    production_house {
        int house_id PK
        varchar name
        varchar contact_info
    }
    role {
        int role_id PK
        varchar role_name UK
    }
    scene {
        int scene_id PK
        int production_id FK
        int scene_number
        text description
        varchar required_location_type
        int planned_duration
        varchar priority
        varchar status
        vector embedding
    }
    scene_cast {
        int scene_id PK, FK
        int actor_id PK, FK
    }
    scene_crew {
        int scene_id PK, FK
        int crew_id PK, FK
    }
    service_booking {
        int service_booking_id PK
        int production_id FK
        int vendor_id FK
        varchar service_name
        timestamp start_time
        timestamp end_time
        numeric charge
        varchar status
        int invoice_id FK
    }
    shooting_schedule {
        int schedule_id PK
        int scene_id FK
        int location_id FK
        date shoot_date
        time start_time
        time end_time
        varchar status
        numeric charge
        tsrange during
        int invoice_id FK
    }
    users {
        int user_id PK
        varchar name
        varchar email UK
        varchar password_hash
        int role_id FK
        timestamp created_at
    }
    vendor {
        int vendor_id PK
        varchar name
        varchar contact_info
        varchar vendor_type
    }

    actor ||--o{ scene_cast : "actor_id"
    crew_member ||--o{ scene_crew : "crew_id"
    equipment |o--o{ incident : "equipment_id"
    equipment ||--o{ equipment_booking : "equipment_id"
    invoice |o--o{ equipment_booking : "invoice_id"
    invoice |o--o{ service_booking : "invoice_id"
    invoice |o--o{ shooting_schedule : "invoice_id"
    invoice ||--o{ payment : "invoice_id"
    location |o--o{ incident : "location_id"
    location ||--o{ shooting_schedule : "location_id"
    production ||--o{ budget_alert : "production_id"
    production ||--o{ invoice : "production_id"
    production ||--o{ scene : "production_id"
    production ||--o{ service_booking : "production_id"
    production_house |o--o{ production : "house_id"
    role ||--o{ users : "role_id"
    scene ||--o{ scene_cast : "scene_id"
    scene ||--o{ scene_crew : "scene_id"
    scene ||--o{ shooting_schedule : "scene_id"
    shooting_schedule ||--o{ equipment_booking : "schedule_id"
    users |o--o{ incident : "reported_by"
    users |o--o{ production : "manager_id"
    users |o--o| crew_member : "user_id"
    vendor ||--o{ service_booking : "vendor_id"
```

**Legend:** PK primary key, FK foreign key, UK unique.
`||--o{` one to many (parent required), `|o--o{` one to many (parent optional), `o|` one to one.
The EXCLUDE constraints (`no_location_overlap`, `no_equipment_overlap`) are not drawn; see `database/ddl/01_schema.sql`.
