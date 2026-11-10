#!/usr/bin/env python3
"""
CineGrid seed script - Shreyashree (Talent, Vendors, Finance)

  python scripts/seed_people_finance.py --base      # roles, users, houses, actors, crew, vendors
  python scripts/seed_people_finance.py --finance   # cast/crew assignments, service bookings, invoices, payments

Order of the whole seed:  --base  ->  seed_resources.py  ->  --finance
(--finance needs productions/scenes/schedules from seed_resources.py).

Reads DATABASE_URL from .env. Re-runnable only on a fresh DB (docker compose down -v).
All demo users share the password in DEMO_PASSWORD.
"""
import argparse
import os
import random
import sys
from datetime import date, datetime, time, timedelta
from decimal import Decimal

import bcrypt
import psycopg
from dotenv import load_dotenv
from faker import Faker

load_dotenv()
rnd = random.Random(42)
fake = Faker("en_IN")
Faker.seed(42)

<<<<<<< HEAD
DEMO_PASSWORD = "Password@123"
=======
DEMO_PASSWORD = os.environ.get("DEMO_PASSWORD", "Password@123")
>>>>>>> origin/feat/db-finance-talent
TODAY = date.today()
CENT = Decimal("0.01")

N_MANAGERS = 8
N_CREW_USERS = 30
N_HOUSES = 15
N_ACTORS = 200
N_CREW = 150
N_VENDORS = 24

CREW_ROLES = ["Director of Photography", "Gaffer", "Sound Engineer", "Makeup Artist",
              "Costume Designer", "Grip", "Camera Operator", "Production Assistant",
              "Art Director", "Editor", "Boom Operator", "Script Supervisor",
              "Stunt Coordinator", "Focus Puller"]

# (name suffix, service_name used in bookings, hourly rate range in INR, vendor_type)
VENDOR_TYPES = [
    ("Catering Co", "Catering", (800, 2500), "catering"),
    ("Transport Services", "Transport", (500, 1800), "transport"),
    ("Security Services", "Security", (400, 1200), "security"),
    ("Costumes", "Costume Rental", (600, 2000), "costume"),
    ("Makeup Studio", "Makeup & Hair", (700, 2200), "makeup"),
    ("VFX Labs", "VFX Support", (1500, 5000), "vfx"),
    ("Power & Generators", "Generator & Power", (900, 2800), "power"),
    ("Sets & Props", "Props Supply", (600, 2400), "props"),
]
SERVICE_BY_TYPE = {vt: (service, rate) for _, service, rate, vt in VENDOR_TYPES}

PAY_METHODS = ["UPI", "NEFT", "CHEQUE", "CARD"]


def seed_base(conn):
    cur = conn.cursor()
    cur.execute("SELECT count(*) FROM actor")
    if cur.fetchone()[0]:
        sys.exit("Base data already present. Recreate the DB first (docker compose down -v).")

    pw = bcrypt.hashpw(DEMO_PASSWORD.encode(), bcrypt.gensalt(rounds=10)).decode()

    for r in ("ADMIN", "PRODUCTION_MANAGER", "CREW"):
        cur.execute("INSERT INTO role(role_name) VALUES (%s) ON CONFLICT (role_name) DO NOTHING", (r,))
    cur.execute("SELECT role_name, role_id FROM role")
    roles = dict(cur.fetchall())

    cur.execute("INSERT INTO users(name,email,password_hash,role_id) VALUES (%s,%s,%s,%s)",
                ("Admin", "admin@cinegrid.test", pw, roles["ADMIN"]))
    for i in range(1, N_MANAGERS + 1):
        cur.execute("INSERT INTO users(name,email,password_hash,role_id) VALUES (%s,%s,%s,%s)",
                    (fake.name(), f"manager{i}@cinegrid.test", pw, roles["PRODUCTION_MANAGER"]))
    crew_user_ids = []
    for i in range(1, N_CREW_USERS + 1):
        cur.execute("INSERT INTO users(name,email,password_hash,role_id) VALUES (%s,%s,%s,%s) RETURNING user_id",
                    (fake.name(), f"crew{i}@cinegrid.test", pw, roles["CREW"]))
        crew_user_ids.append(cur.fetchone()[0])

    suffixes = ["Films", "Pictures", "Studios", "Entertainment", "Productions", "Motion Pictures"]
    for _ in range(N_HOUSES):
        cur.execute("INSERT INTO production_house(name,contact_info) VALUES (%s,%s)",
                    (f"{fake.last_name()} {rnd.choice(suffixes)}", fake.company_email()))

    for _ in range(N_ACTORS):
        cur.execute("INSERT INTO actor(name,contact_info) VALUES (%s,%s)",
                    (fake.name(), fake.phone_number()))

    for i in range(N_CREW):
        uid = crew_user_ids[i] if i < len(crew_user_ids) else None
        name = fake.name()
        cur.execute("INSERT INTO crew_member(name,crew_role,contact_info,user_id) VALUES (%s,%s,%s,%s)",
                    (name, rnd.choice(CREW_ROLES), fake.phone_number(), uid))
        if uid:  # keep the login name consistent with the crew record
            cur.execute("UPDATE users SET name=%s WHERE user_id=%s", (name, uid))

    for v in range(N_VENDORS):
        suffix, _, _, v_type = VENDOR_TYPES[v % len(VENDOR_TYPES)]
        cur.execute("INSERT INTO vendor(name,contact_info,vendor_type) VALUES (%s,%s,%s)",
                    (f"{fake.last_name()} {suffix}", fake.company_email(), v_type))

    print(f"base: 1 admin, {N_MANAGERS} managers, {N_CREW_USERS} crew users, {N_HOUSES} houses, "
          f"{N_ACTORS} actors, {N_CREW} crew, {N_VENDORS} vendors")


def _split(total, parts):
    """Split a Decimal total into `parts` positive random chunks summing exactly to total."""
    weights = [rnd.uniform(0.5, 1.5) for _ in range(parts)]
    s = sum(weights)
    amounts = [(total * Decimal(str(w / s))).quantize(CENT) for w in weights[:-1]]
    amounts.append(total - sum(amounts))
    return amounts


def seed_finance(conn):
    cur = conn.cursor()
    cur.execute("SELECT count(*) FROM production")
    if cur.fetchone()[0] == 0:
        sys.exit("No productions found. Run seed_resources.py first.")
    cur.execute("SELECT count(*) FROM invoice")
    if cur.fetchone()[0]:
        sys.exit("Finance data already present. Recreate the DB first.")

    # ---- cast / crew assignments (clash trigger may reject some) ----
    cur.execute("SELECT scene_id FROM scene")
    scenes = [r[0] for r in cur.fetchall()]
    cur.execute("SELECT actor_id FROM actor")
    actors = [r[0] for r in cur.fetchall()]
    cur.execute("SELECT crew_id FROM crew_member")
    crew = [r[0] for r in cur.fetchall()]

    ok_cast = skip_cast = ok_crew = skip_crew = 0
    for sid in scenes:
        for aid in rnd.sample(actors, rnd.randint(1, 4)):
            try:
                with conn.transaction():  # savepoint: a trigger rejection only undoes this row
                    cur.execute("INSERT INTO scene_cast(scene_id,actor_id) VALUES (%s,%s)", (sid, aid))
                ok_cast += 1
            except psycopg.errors.RaiseException:
                skip_cast += 1
        for cid in rnd.sample(crew, rnd.randint(2, 5)):
            try:
                with conn.transaction():
                    cur.execute("INSERT INTO scene_crew(scene_id,crew_id) VALUES (%s,%s)", (sid, cid))
                ok_crew += 1
            except psycopg.errors.RaiseException:
                skip_crew += 1

    # ---- service bookings ----
    cur.execute("SELECT vendor_id, vendor_type FROM vendor")
    vendors = [(vid, *SERVICE_BY_TYPE[vt]) for vid, vt in cur.fetchall()]
    cur.execute("SELECT production_id, start_date, planned_end_date, status FROM production")
    productions = cur.fetchall()

    n_service = 0
    for pid, sd, ed, status in productions:
        n = rnd.randint(0, 1) if status == "PLANNED" else rnd.randint(2, 6)
        base = sd or TODAY - timedelta(days=rnd.randint(10, 200))
        last = ed or base + timedelta(days=60)
        span = max((last - base).days, 1)
        for _ in range(n):
            vid, service, (lo, hi) = rnd.choice(vendors)
            day = base + timedelta(days=rnd.randint(0, span))
            start = datetime.combine(day, time(rnd.randint(6, 14), 0))
            hours = rnd.choice([4, 6, 8, 10, 12])
            charge = Decimal(rnd.randint(lo, hi) * hours)
            if rnd.random() < 0.05:
                st = "CANCELLED"
            else:
                st = "COMPLETED" if day < TODAY else "CONFIRMED"
            cur.execute(
                "INSERT INTO service_booking(production_id,vendor_id,service_name,start_time,end_time,charge,status) "
                "VALUES (%s,%s,%s,%s,%s,%s,%s)",
                (pid, vid, service, start, start + timedelta(hours=hours), charge, st))
            n_service += 1

    # ---- invoices + payments (payment trigger sets invoice status) ----
    cur.execute("SELECT production_id, production_total_cost(production_id) FROM production "
                "WHERE status NOT IN ('PLANNED', 'CANCELLED')")
    n_inv = n_pay = 0
    for pid, cost in cur.fetchall():
        cost = Decimal(cost)
        if cost <= 0:
            cost = Decimal(rnd.randint(50000, 500000))
        for total in _split(cost, rnd.choice([1, 2, 3])):
            if total <= 0:
                continue
            issue = TODAY - timedelta(days=rnd.randint(5, 240))
            draft = rnd.random() < 0.04
            cur.execute("INSERT INTO invoice(production_id,total_amount,status,issue_date) "
                        "VALUES (%s,%s,%s,%s) RETURNING invoice_id",
                        (pid, total, "DRAFT" if draft else "ISSUED", None if draft else issue))
            inv_id = cur.fetchone()[0]
            n_inv += 1
            if draft:
                continue
            r = rnd.random()
            if r < 0.45:
                target = total                                     # fully paid
            elif r < 0.70:
                target = (total * Decimal(str(rnd.uniform(0.3, 0.8)))).quantize(CENT)  # partial
            else:
                continue                                           # unpaid
            if target <= 0:
                continue
            parts = rnd.randint(1, 3) if target >= 3 else 1
            amounts = [(target / parts).quantize(CENT)] * (parts - 1)
            amounts.append(target - sum(amounts))
            for amt in amounts:
                pay_date = min(issue + timedelta(days=rnd.randint(3, 60)), TODAY)
                cur.execute("INSERT INTO payment(invoice_id,amount,payment_date,method) VALUES (%s,%s,%s,%s)",
                            (inv_id, amt, pay_date, rnd.choice(PAY_METHODS)))
                n_pay += 1

    cur.execute("UPDATE invoice SET status='OVERDUE' WHERE status IN ('ISSUED', 'PARTIALLY_PAID') AND issue_date < %s",
                (TODAY - timedelta(days=45),))

    print(f"finance: cast {ok_cast} (skipped {skip_cast} clashes), crew {ok_crew} (skipped {skip_crew}), "
          f"{n_service} service bookings, {n_inv} invoices, {n_pay} payments")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", action="store_true")
    ap.add_argument("--finance", action="store_true")
    args = ap.parse_args()
    if not (args.base or args.finance):
        ap.error("pass --base and/or --finance")

    url = os.environ.get("DATABASE_URL")
    if not url:
        sys.exit("DATABASE_URL not set (put it in .env)")

    with psycopg.connect(url) as conn:   # one transaction per run; commits on success
        if args.base:
            seed_base(conn)
        if args.finance:
            seed_finance(conn)
    print("done")


if __name__ == "__main__":
    main()
