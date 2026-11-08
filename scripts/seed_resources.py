#!/usr/bin/env python3
"""
CineGrid seed script - Shravani (Resources: locations, equipment, productions, scenes,
schedules, equipment bookings, incidents)

  python scripts/seed_resources.py

Order of the whole seed:  seed_people_finance.py --base  ->  seed_resources.py  ->  seed_people_finance.py --finance

Bookings go through the real book_location() / book_equipment() functions, so every row
passes the same checks and exclusion constraints as the app. A conflict just means that
slot is skipped and another one is tried.
Embeddings are left NULL; feat/vector fills them.

Reads DATABASE_URL from .env. Re-runnable only on a fresh DB (docker compose down -v).
"""
import os
import random
import sys
from datetime import date, datetime, time, timedelta
from decimal import Decimal

import psycopg
from dotenv import load_dotenv
from faker import Faker

load_dotenv()
rnd = random.Random(7)
fake = Faker("en_IN")
Faker.seed(7)

TODAY = date.today()
N_PRODUCTIONS = 28

# ---------------------------------------------------------------- reference data
# (name, type, capacity, rental price per hour in INR, description)
LOCATIONS = [
    ("Stage 1 - Grand Sound Stage", "sound_stage", 150, 12000, "Large soundproofed stage with a 40-foot ceiling and full lighting grid, suited to big-budget feature sets and musical numbers."),
    ("Stage 2 - Mid Sound Stage", "sound_stage", 80, 7500, "Mid-size soundproofed stage with a flexible lighting grid, good for dialogue-heavy drama and series work."),
    ("Stage 3 - Compact Sound Stage", "sound_stage", 40, 4500, "Compact quiet stage for small sets, inserts and pickup shots."),
    ("Green Screen Studio", "studio", 30, 6000, "Chroma-green cyclorama with tracking rails and motion control support for VFX-heavy shots."),
    ("Interview & Talk Studio", "studio", 15, 2500, "Small studio with a talk-show desk, soft lighting and multi-camera setup."),
    ("Music Video Studio", "studio", 40, 5000, "White cyclorama with LED wall panels and haze support for music videos and dance sequences."),
    ("Ad Film Studio A", "studio", 25, 3500, "Clean product-shoot studio with overhead rigging, seamless backdrops and a makeup room."),
    ("Ad Film Studio B", "studio", 25, 3500, "Twin of Studio A with a built-in kitchen set for food and lifestyle commercials."),
    ("Photography Studio", "studio", 12, 2200, "Daylight-style studio with large windows and flexible backdrops for stills and lookbook shoots."),
    ("Old City Street Backlot", "backlot", 200, 9000, "Period street styled as a 1940s Indian bazaar with shopfronts, tram tracks and lamp posts."),
    ("Modern Downtown Backlot", "backlot", 150, 8500, "Contemporary city block with glass storefronts, a fake metro entrance and rooftop access."),
    ("Village Square Backlot", "backlot", 120, 6500, "Rustic village with a well, temple steps and mud-brick houses."),
    ("Colonial Quarter Backlot", "backlot", 100, 7000, "Colonial-era lane with white bungalows, verandahs and a clock tower."),
    ("Lakeside Outdoor Location", "outdoor", 100, 5500, "Open lakeside with a wooden jetty and tree cover, great at golden hour."),
    ("Hill Road Outdoor Location", "outdoor", 60, 4000, "Winding hill road with scenic overlooks for car chases and road-trip sequences."),
    ("Open Grounds", "outdoor", 500, 7000, "Flat ten-acre ground for large crowd, battle and festival scenes."),
    ("Rock Quarry", "outdoor", 80, 4800, "Rugged quarry with steep walls for action and stunt sequences."),
    ("Palace Interior Set", "set", 60, 9500, "Opulent palace hall with chandeliers, marble floors and carved pillars."),
    ("Police Station Set", "set", 30, 3000, "Working-looking police station with a lockup, interrogation room and cluttered desks."),
    ("Hospital Ward Set", "set", 35, 3200, "Hospital ward with beds, an operating theatre and a reception counter."),
    ("Penthouse Apartment Set", "set", 20, 3800, "Luxury penthouse with floor-to-ceiling glass and a city-skyline backdrop."),
    ("Courtroom Set", "set", 40, 3500, "Wood-panelled courtroom with a judge's bench, witness box and gallery seating."),
    ("Middle-Class Home Set", "set", 18, 2200, "Lived-in two-bedroom home with a kitchen, hall and balcony."),
    ("Airport Lounge Set", "set", 45, 4200, "Departure lounge with check-in counters, gate seating and a runway-view window."),
]

# (serial prefix, name, category, price per hour in INR, description, units)
EQUIPMENT = [
    ("ARRI-AMF", "ARRI Alexa Mini LF", "camera", 4500, "Large-format cinema camera with a 4.5K sensor for feature work.", 4),
    ("RED-VRP", "RED V-Raptor 8K", "camera", 4000, "High-resolution 8K cinema camera for VFX and large-format shooting.", 3),
    ("SNY-FX6", "Sony FX6 Cinema Line", "camera", 1800, "Compact full-frame cinema camera for series, ads and run-and-gun work.", 5),
    ("BMD-URSA", "Blackmagic URSA Mini Pro 12K", "camera", 2200, "12K Super 35 camera with great dynamic range for commercial work.", 3),
    ("ARRI-SKY", "ARRI SkyPanel S60 LED", "lighting", 900, "Soft tunable LED panel for key and fill light.", 8),
    ("APT-600D", "Aputure 600d Pro", "lighting", 700, "Daylight-balanced COB light for outdoor fill and large sets.", 8),
    ("KINO-4", "Kino Flo 4-Bank Fixture", "lighting", 400, "Flicker-free fluorescent for interviews and beauty lighting.", 6),
    ("HMI-4K", "ARRI M40 HMI 4kW", "lighting", 1100, "High-output daylight HMI for simulating sun through windows.", 4),
    ("SND-788", "Sound Devices 788T Recorder", "sound", 800, "Eight-channel field recorder for multi-mic dialogue capture.", 4),
    ("SEN-MKH", "Sennheiser MKH 416 Shotgun Mic", "sound", 350, "Industry-standard shotgun microphone for on-set dialogue.", 8),
    ("LAV-DPA", "DPA 4060 Lavalier Set", "sound", 300, "Miniature lavalier mics for hidden body-mic work.", 10),
    ("BOOM-K", "Boom Pole & Blimp Kit", "sound", 150, "Lightweight boom pole with windshield blimp for outdoor audio.", 6),
    ("DOLLY-1", "Dana Dolly with Track", "grip", 600, "Portable dolly and straight track for smooth tracking shots.", 4),
    ("CRANE-J", "Jimmy Jib Crane 12ft", "grip", 1800, "Telescopic jib arm for sweeping crane shots.", 2),
    ("GIM-RS3", "DJI RS3 Pro Gimbal", "grip", 350, "Handheld stabiliser for moving camera work.", 6),
    ("TRIPOD", "Sachtler Fluid Head Tripod", "grip", 200, "Heavy-duty tripod with a fluid head for stable camera support.", 8),
    ("DRN-M3", "DJI Inspire 3 Drone", "other", 3500, "Cinema drone with an 8K camera for aerial establishing shots.", 2),
    ("GEN-45", "45 kVA Silent Generator", "other", 1200, "Silent diesel generator for outdoor power.", 3),
    ("MON-17", "17-inch Director's Monitor", "other", 250, "Wireless monitor for director and DP.", 6),
    ("SMOKE", "Hazer & Fog Machine", "other", 300, "Atmospheric haze for volumetric light beams.", 4),
]

TITLE_A = ["Midnight", "Silent", "Crimson", "Broken", "Golden", "Last", "Hidden", "Electric", "Monsoon",
           "Paper", "Iron", "Velvet", "Distant", "Burning", "Hollow", "Silver", "Wandering", "Fading",
           "Secret", "Restless"]
TITLE_B = ["Horizon", "Verdict", "Letters", "Harbour", "Echo", "Kingdom", "Promise", "Express", "Season",
           "Tide", "Garden", "Signal", "Mirror", "Journey", "Shadow", "Rhythm", "Frontier", "Lantern",
           "Orchard", "Threshold"]
GENRES = ["crime thriller", "family drama", "romantic comedy", "period drama", "action adventure",
          "sci-fi mystery", "sports drama", "political drama"]

PROD_TYPES = [("feature_film", 6), ("web_series", 6), ("tv_series", 4), ("ad", 6),
              ("music_video", 4), ("short_film", 3)]
PROD_STATUSES = [("PLANNED", 3), ("PRE_PRODUCTION", 5), ("SHOOTING", 9),
                 ("POST_PRODUCTION", 5), ("COMPLETED", 5), ("CANCELLED", 1)]

LOC_TYPES = ["set", "studio", "outdoor", "backlot", "sound_stage"]
LOC_WEIGHTS = [4, 3, 3, 2, 2]
INT_EXT = {"studio": "interior", "sound_stage": "interior", "set": "interior",
           "outdoor": "exterior", "backlot": "exterior"}
MOODS = ["tense", "emotional", "comedic", "romantic", "high-energy", "quiet", "suspenseful"]
ACTIONS = {
    "studio": ["a product pitch to camera", "a tense interview under hard lights",
               "a dance sequence against a clean backdrop", "a green-screen stunt rehearsal"],
    "sound_stage": ["a dialogue-heavy courtroom drama", "a large musical number with a full ensemble",
                    "a spaceship cockpit emergency", "a crowded hospital corridor"],
    "outdoor": ["a car chase along a winding road", "a quiet conversation by the water at golden hour",
                "a crowd gathering for a festival", "a chase on foot over rough terrain"],
    "backlot": ["a street market argument", "a rooftop chase between buildings",
                "a wedding procession through the lanes", "a stand-off in the town square"],
    "set": ["a family argument over dinner", "a late-night interrogation",
            "a quiet reunion between old friends", "a confession in a dim room"],
}
DURATIONS = [90, 120, 180, 240, 300, 360, 480]  # minutes

# (category, chance of being booked, min units, max units)
EQUIP_PLAN = [("camera", 1.0, 1, 1), ("lighting", 0.6, 1, 2), ("sound", 0.7, 1, 2),
              ("grip", 0.4, 1, 1), ("other", 0.15, 1, 1)]

INCIDENT_TEXT = {
    "equipment_damage": ["Lens mount cracked after a fall from the dolly.",
                         "Unit stopped powering on mid-shoot; suspected battery board fault.",
                         "Cable and connector damaged by water splash on location."],
    "location_damage": ["Section of set wall damaged during a stunt sequence.",
                        "Flooring damaged by heavy equipment; needs repair before next booking."],
    "safety": ["Loose rigging found above the stage floor; area cleared and inspected.",
               "Minor trip hazard from unsecured cables near the set entrance."],
    "operational": ["Power tripped during a long take; generator switched over.",
                    "Catering delivery delayed, pushing back the lunch break.",
                    "Crew transport arrived late, delaying the call time."],
}


# ---------------------------------------------------------------- helpers
def pick(weighted):
    return rnd.choices([v for v, _ in weighted], weights=[w for _, w in weighted])[0]


def date_range(status):
    if status == "PLANNED":
        s = TODAY + timedelta(days=rnd.randint(30, 120))
        e = s + timedelta(days=rnd.randint(60, 150))
    elif status == "PRE_PRODUCTION":
        s = TODAY + timedelta(days=rnd.randint(-10, 25))
        e = s + timedelta(days=rnd.randint(60, 120))
    elif status == "SHOOTING":
        s = TODAY - timedelta(days=rnd.randint(30, 90))
        e = TODAY + timedelta(days=rnd.randint(20, 90))
    elif status == "POST_PRODUCTION":
        s = TODAY - timedelta(days=rnd.randint(150, 250))
        e = TODAY - timedelta(days=rnd.randint(5, 60))
    elif status == "COMPLETED":
        s = TODAY - timedelta(days=rnd.randint(300, 500))
        e = s + timedelta(days=rnd.randint(60, 150))
    else:  # CANCELLED
        s = TODAY + timedelta(days=rnd.randint(10, 60))
        e = s + timedelta(days=rnd.randint(60, 120))
    return s, e


def pick_day(p, allow_today=True):
    lo, hi = p["start"], p["end"]
    if p["status"] == "PRE_PRODUCTION":
        lo = max(lo, TODAY)
    if p["status"] in ("POST_PRODUCTION", "COMPLETED"):
        hi = min(hi, TODAY - timedelta(days=1))
    if hi < lo:
        hi = lo
    if allow_today and p["status"] == "SHOOTING" and rnd.random() < 0.15:
        return TODAY  # make sure the dashboard has something on today
    return lo + timedelta(days=rnd.randint(0, (hi - lo).days))


def final_status(day):
    r = rnd.random()
    if r < 0.04:
        return "CANCELLED"
    if day < TODAY:
        return "COMPLETED"
    if day == TODAY:
        return rnd.choice(["CONFIRMED", "IN_PROGRESS"])
    return "CONFIRMED" if r < 0.8 else "PLANNED"


# ---------------------------------------------------------------- seeders
def seed_locations(cur):
    for name, typ, cap, price, desc in LOCATIONS:
        cur.execute("INSERT INTO location(name,type,capacity,rental_price,description) VALUES (%s,%s,%s,%s,%s)",
                    (name, typ, cap, price, desc))
    return len(LOCATIONS)


def seed_equipment(cur):
    n = 0
    for prefix, name, cat, price, desc, units in EQUIPMENT:
        for i in range(1, units + 1):
            cur.execute(
                "INSERT INTO equipment(name,category,serial_number,rental_price,description) "
                "VALUES (%s,%s,%s,%s,%s)",
                (f"{name} #{i}", cat, f"{prefix}-{i:03d}", price, desc))
            n += 1
    return n


def seed_productions(cur):
    cur.execute("SELECT house_id FROM production_house")
    houses = [r[0] for r in cur.fetchall()]
    cur.execute("SELECT u.user_id FROM users u JOIN role r ON r.role_id = u.role_id "
                "WHERE r.role_name = 'PRODUCTION_MANAGER'")
    managers = [r[0] for r in cur.fetchall()]

    used, prods = set(), []
    for _ in range(N_PRODUCTIONS):
        while True:
            title = f"{rnd.choice(TITLE_A)} {rnd.choice(TITLE_B)}"
            if title not in used:
                used.add(title)
                break
        ptype = pick(PROD_TYPES)
        status = pick(PROD_STATUSES)
        start, end = date_range(status)
        if ptype in ("ad", "music_video", "short_film"):
            budget = Decimal(rnd.randint(5, 60) * 100000)
        else:
            budget = Decimal(rnd.randint(100, 600) * 100000)
        desc = f"A {rnd.choice(GENRES)} {ptype.replace('_', ' ')}."
        cur.execute(
            "INSERT INTO production(title,type,house_id,manager_id,start_date,planned_end_date,budget,status,description) "
            "VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING production_id",
            (title, ptype, rnd.choice(houses), rnd.choice(managers), start, end, budget, status, desc))
        prods.append({"id": cur.fetchone()[0], "status": status, "start": start, "end": end})
    return prods


def try_book(conn, cur, scene_id, rtype, p, dur, locs, all_locs):
    """Try up to 12 slots through book_location(); return (schedule_id, day) or None."""
    for attempt in range(12):
        loc = rnd.choice(locs[rtype] if attempt < 8 else all_locs)
        day = pick_day(p, allow_today=(attempt == 0))
        start_min = rnd.randrange(6 * 60, 15 * 60 + 1, 30)
        end_min = start_min + dur
        t0, t1 = time(start_min // 60, start_min % 60), time(end_min // 60, end_min % 60)
        try:
            with conn.transaction():  # savepoint: a rejected booking only undoes itself
                cur.execute("SELECT book_location(%s,%s,%s,%s,%s)", (scene_id, loc, day, t0, t1))
                return cur.fetchone()[0], day
        except psycopg.errors.RaiseException:
            continue
    return None


def seed_scenes_and_schedules(conn, cur, prods):
    cur.execute("SELECT location_id, type FROM location WHERE status = 'AVAILABLE'")
    locs = {t: [] for t in LOC_TYPES}
    all_locs = []
    for lid, typ in cur.fetchall():
        locs[typ].append(lid)
        all_locs.append(lid)

    n_scenes = n_sched = n_unbooked = 0
    active = []  # schedule_ids that still count (not cancelled)
    for p in prods:
        inactive = p["status"] in ("PLANNED", "CANCELLED")
        n = rnd.randint(3, 6) if inactive else rnd.randint(6, 12)
        for num in range(1, n + 1):
            rtype = rnd.choices(LOC_TYPES, weights=LOC_WEIGHTS)[0]
            dur = rnd.choice(DURATIONS)
            desc = (f"{rnd.choice(MOODS).capitalize()} {INT_EXT[rtype]} scene featuring "
                    f"{rnd.choice(ACTIONS[rtype])}.")
            cur.execute(
                "INSERT INTO scene(production_id,scene_number,description,required_location_type,"
                "planned_duration,priority,status) VALUES (%s,%s,%s,%s,%s,%s,%s) RETURNING scene_id",
                (p["id"], num, desc, rtype, dur, rnd.choice(["LOW", "MEDIUM", "HIGH"]),
                 "CANCELLED" if p["status"] == "CANCELLED" else "PLANNED"))
            sid = cur.fetchone()[0]
            n_scenes += 1

            if inactive:
                continue
            if p["status"] == "PRE_PRODUCTION" and rnd.random() > 0.6:
                continue  # not everything is scheduled yet in pre-production

            booked = try_book(conn, cur, sid, rtype, p, dur, locs, all_locs)
            if not booked:
                n_unbooked += 1
                continue
            sched_id, day = booked
            n_sched += 1

            st = final_status(day)
            cur.execute("UPDATE shooting_schedule SET status = %s WHERE schedule_id = %s", (st, sched_id))
            if st == "COMPLETED":
                cur.execute("UPDATE scene SET status = 'SHOT' WHERE scene_id = %s", (sid,))
            elif st == "CANCELLED":
                cur.execute("UPDATE scene SET status = 'PLANNED' WHERE scene_id = %s", (sid,))
            if st != "CANCELLED":
                active.append(sched_id)
    return n_scenes, n_sched, n_unbooked, active


def seed_equipment_bookings(conn, cur, active):
    cur.execute("SELECT equipment_id, category FROM equipment")
    by_cat = {}
    for eid, cat in cur.fetchall():
        by_cat.setdefault(cat, []).append(eid)

    ok = skipped = 0
    for sched_id in active:
        for cat, prob, lo, hi in EQUIP_PLAN:
            if rnd.random() > prob:
                continue
            for eid in rnd.sample(by_cat[cat], rnd.randint(lo, hi)):
                try:
                    with conn.transaction():
                        cur.execute("SELECT book_equipment(%s,%s)", (sched_id, eid))
                    ok += 1
                except psycopg.errors.RaiseException:
                    skipped += 1  # double-booked: the exclusion constraint did its job
    return ok, skipped


def seed_incidents(cur):
    cur.execute("SELECT user_id FROM users")
    user_ids = [r[0] for r in cur.fetchall()]
    cur.execute("SELECT equipment_id FROM equipment")
    eq_pool = rnd.sample([r[0] for r in cur.fetchall()], 6)
    cur.execute("SELECT location_id FROM location")
    loc_pool = rnd.sample([r[0] for r in cur.fetchall()], 2)

    plan = (["equipment_damage"] * 6 + ["location_damage"] * 2 + ["safety"] * 2 + ["operational"] * 3)
    n = 0
    for typ in plan:
        eid = eq_pool.pop() if typ == "equipment_damage" else None
        lid = loc_pool.pop() if typ == "location_damage" else None
        reported = datetime.now() - timedelta(days=rnd.randint(1, 90), hours=rnd.randint(0, 23))
        # Inserted as OPEN: the insert trigger puts damaged items into MAINTENANCE.
        cur.execute(
            "INSERT INTO incident(type,equipment_id,location_id,reported_by,description,reported_at) "
            "VALUES (%s,%s,%s,%s,%s,%s) RETURNING incident_id",
            (typ, eid, lid, rnd.choice(user_ids), rnd.choice(INCIDENT_TEXT[typ]), reported))
        inc_id = cur.fetchone()[0]
        n += 1

        target = rnd.choices(["RESOLVED", "IN_PROGRESS", "OPEN"], weights=[6, 2, 2])[0]
        if target == "RESOLVED":
            # The resolve trigger puts the item back to AVAILABLE if nothing else is open on it.
            resolved = min(reported + timedelta(hours=rnd.randint(4, 120)), datetime.now())
            cur.execute("UPDATE incident SET status='RESOLVED', resolved_at=%s, resolution_notes=%s "
                        "WHERE incident_id=%s",
                        (resolved, "Inspected and fixed; cleared for use.", inc_id))
        elif target == "IN_PROGRESS":
            cur.execute("UPDATE incident SET status='IN_PROGRESS' WHERE incident_id=%s", (inc_id,))
    return n


def main():
    url = os.environ.get("DATABASE_URL")
    if not url:
        sys.exit("DATABASE_URL not set (put it in .env)")

    with psycopg.connect(url) as conn:  # one transaction per run; commits on success
        cur = conn.cursor()
        cur.execute("SELECT count(*) FROM production_house")
        if cur.fetchone()[0] == 0:
            sys.exit("No base data found. Run seed_people_finance.py --base first.")
        cur.execute("SELECT count(*) FROM location")
        if cur.fetchone()[0]:
            sys.exit("Resource data already present. Recreate the DB first (docker compose down -v).")

        n_loc = seed_locations(cur)
        n_eq = seed_equipment(cur)
        prods = seed_productions(cur)
        n_scenes, n_sched, n_unbooked, active = seed_scenes_and_schedules(conn, cur, prods)
        eb_ok, eb_skip = seed_equipment_bookings(conn, cur, active)
        n_inc = seed_incidents(cur)

    print(f"resources: {n_loc} locations, {n_eq} equipment, {len(prods)} productions, {n_scenes} scenes, "
          f"{n_sched} schedules ({n_unbooked} scenes left unbooked), "
          f"{eb_ok} equipment bookings ({eb_skip} skipped on conflict), {n_inc} incidents")
    print("done")


if __name__ == "__main__":
    main()