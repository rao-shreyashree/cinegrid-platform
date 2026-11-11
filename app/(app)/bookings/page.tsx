"use client";
import { useCallback, useEffect, useState } from "react";
import { api, rupees } from "@/lib/client";
import { addMinutes, labelDay, todayISO } from "@/lib/dates";

type Production = { production_id: number; title: string; status: string };
type Scene = {
  scene_id: number;
  scene_number: number;
  description: string | null;
  required_location_type: string | null;
  planned_duration: number | null;
  priority: string;
  status: string;
};
type Loc = { location_id: number; name: string; type: string; capacity: number | null; rental_price: number | null };
type Equip = { equipment_id: number; name: string; category: string; serial_number: string; rental_price: number | null };
type Booked = { schedule_id: number; location: string; date: string; start: string; end: string };
type Msg = { kind: "ok" | "error"; text: string };

const input = "w-full rounded-sm border border-rule bg-panel px-3 py-2";
const primary =
  "rounded-sm bg-ink px-4 py-2 font-medium text-chalk hover:bg-slate disabled:cursor-not-allowed disabled:opacity-40";
const secondary = "rounded-sm border border-rule px-4 py-2 font-medium hover:bg-panel disabled:opacity-40";
const label = (s: string) => s.replace(/_/g, " ");

export default function BookingsPage() {
  const [productions, setProductions] = useState<Production[]>([]);
  const [productionId, setProductionId] = useState("");
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [sceneId, setSceneId] = useState("");
  const [date, setDate] = useState(todayISO());
  const [start, setStart] = useState("09:00");
  const [end, setEnd] = useState("11:00");
  const [locs, setLocs] = useState<Loc[] | null>(null);
  const [locId, setLocId] = useState<number | null>(null);
  const [booked, setBooked] = useState<Booked | null>(null);
  const [equip, setEquip] = useState<Equip[]>([]);
  const [picked, setPicked] = useState<number[]>([]);
  const [msg, setMsg] = useState<Msg | null>(null);
  const [busy, setBusy] = useState(false);
  const [tick, setTick] = useState(0); // bump to re-check which locations are free

  const scene = scenes.find((s) => String(s.scene_id) === sceneId) ?? null;
  const slotOk = !!date && !!start && !!end && end > start;

  // 1. productions that can still be scheduled
  useEffect(() => {
    api<{ productions: Production[] }>("/api/productions").then((r) => {
      if (r.ok) {
        setProductions(r.data.productions.filter((p) => p.status !== "CANCELLED" && p.status !== "COMPLETED"));
      } else {
        setMsg({ kind: "error", text: r.error });
      }
    });
  }, []);

  // 2. scenes of the chosen production that still make sense to book
  useEffect(() => {
    setScenes([]);
    setSceneId("");
    if (!productionId) return;
    let live = true;
    api<{ scenes: Scene[] }>(`/api/scenes?production_id=${productionId}`).then((r) => {
      if (!live) return;
      if (r.ok) setScenes(r.data.scenes.filter((s) => s.status === "PLANNED" || s.status === "SCHEDULED"));
      else setMsg({ kind: "error", text: r.error });
    });
    return () => {
      live = false;
    };
  }, [productionId]);

  // 3. locations that are free for the slot and match the scene's required type
  useEffect(() => {
    setLocs(null);
    setLocId(null);
    if (!scene || !slotOk || booked) return;
    let live = true;
    const type = scene.required_location_type ? `&type=${scene.required_location_type}` : "";
    api<{ locations: Loc[] }>(`/api/locations?free_on=${date}&from=${start}&to=${end}${type}`).then((r) => {
      if (!live) return;
      if (r.ok) setLocs(r.data.locations);
      else setMsg({ kind: "error", text: r.error });
    });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene?.scene_id, scene?.required_location_type, date, start, end, slotOk, booked, tick]);

  const loadEquip = useCallback(async (scheduleId: number) => {
    const r = await api<{ equipment: Equip[] }>(`/api/equipment?schedule_id=${scheduleId}`);
    if (r.ok) setEquip(r.data.equipment);
    else setMsg({ kind: "error", text: r.error });
  }, []);

  async function bookLocation() {
    if (!scene || locId === null) return;
    setBusy(true);
    setMsg(null);
    const r = await api<{ schedule_id: number }>("/api/bookings/location", {
      method: "POST",
      body: { scene_id: scene.scene_id, location_id: locId, date, start, end },
    });
    setBusy(false);
    if (!r.ok) {
      setMsg({ kind: "error", text: r.error });
      setTick((t) => t + 1); // the list may be stale, check again
      return;
    }
    const loc = locs?.find((l) => l.location_id === locId);
    setBooked({ schedule_id: r.data.schedule_id, location: loc?.name ?? "the location", date, start, end });
    setPicked([]);
    setMsg({ kind: "ok", text: `Location booked (booking #${r.data.schedule_id}). Add equipment below if the scene needs it.` });
    await loadEquip(r.data.schedule_id);
  }

  async function bookEquipment() {
    if (!booked || picked.length === 0) return;
    setBusy(true);
    setMsg(null);
    const r = await api<{ equip_booking_ids: number[] }>("/api/bookings/equipment", {
      method: "POST",
      body: { schedule_id: booked.schedule_id, equipment_ids: picked },
    });
    setBusy(false);
    if (!r.ok) {
      setMsg({ kind: "error", text: `${r.error}. Nothing was booked, it is all or none.` });
    } else {
      const n = r.data.equip_booking_ids.length;
      setMsg({ kind: "ok", text: `${n} item${n === 1 ? "" : "s"} booked.` });
    }
    setPicked([]);
    await loadEquip(booked.schedule_id);
  }

  async function cancelBooking() {
    if (!booked) return;
    if (!window.confirm("Cancel this booking? Its equipment bookings are cancelled too.")) return;
    setBusy(true);
    const r = await api(`/api/bookings/${booked.schedule_id}`, { method: "PATCH", body: { status: "CANCELLED" } });
    setBusy(false);
    if (!r.ok) {
      setMsg({ kind: "error", text: r.error });
      return;
    }
    setBooked(null);
    setEquip([]);
    setPicked([]);
    setMsg({ kind: "ok", text: "Booking cancelled." });
  }

  function bookAnother() {
    setBooked(null);
    setEquip([]);
    setPicked([]);
    setMsg(null);
  }

  function togglePick(id: number) {
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  }

  const byCategory: Record<string, Equip[]> = {};
  for (const e of equip) (byCategory[e.category] ||= []).push(e);

  return (
    <div className="max-w-3xl">
      <h1 className="font-display text-4xl font-bold tracking-tight">Book a shoot</h1>
      <p className="mt-1 text-muted">Pick a scene, choose a slot, then lock in the location and equipment.</p>

      {msg && (
        <p
          role={msg.kind === "error" ? "alert" : "status"}
          className={`mt-6 rounded-sm border px-4 py-3 ${
            msg.kind === "error" ? "border-alert text-alert" : "border-rule bg-panel"
          }`}
        >
          {msg.text}
        </p>
      )}

      {/* Step 1: scene */}
      <section className="mt-8" aria-labelledby="s1">
        <h2 id="s1" className="font-display text-xl font-semibold mb-3">1. Scene</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="text-sm text-muted">Production</span>
            <select className={input} value={productionId} disabled={!!booked} onChange={(e) => setProductionId(e.target.value)}>
              <option value="">Choose a production</option>
              {productions.map((p) => (
                <option key={p.production_id} value={p.production_id}>
                  {p.title}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-sm text-muted">Scene</span>
            <select
              className={input}
              value={sceneId}
              disabled={!productionId || !!booked}
              onChange={(e) => {
                setSceneId(e.target.value);
                const s = scenes.find((x) => String(x.scene_id) === e.target.value);
                if (s?.planned_duration && start) setEnd(addMinutes(start, s.planned_duration));
              }}
            >
              <option value="">{productionId ? "Choose a scene" : "Pick a production first"}</option>
              {scenes.map((s) => (
                <option key={s.scene_id} value={s.scene_id}>
                  Scene {s.scene_number} ({s.status.toLowerCase()})
                </option>
              ))}
            </select>
          </label>
        </div>
        {scene && (
          <p className="mt-3 text-sm text-muted">
            {scene.description ?? "No description."}{" "}
            <span className="text-ink">
              Needs a {scene.required_location_type ? label(scene.required_location_type) : "any"} location
              {scene.planned_duration ? `, about ${scene.planned_duration} min` : ""}.
            </span>
          </p>
        )}
      </section>

      {/* Step 2: slot */}
      <section className="mt-10" aria-labelledby="s2">
        <h2 id="s2" className="font-display text-xl font-semibold mb-3">2. Slot</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <label className="block">
            <span className="text-sm text-muted">Date</span>
            <input type="date" className={input} value={date} disabled={!!booked} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label className="block">
            <span className="text-sm text-muted">Start</span>
            <input
              type="time"
              className={input}
              value={start}
              disabled={!!booked}
              onChange={(e) => {
                setStart(e.target.value);
                if (scene?.planned_duration && e.target.value) setEnd(addMinutes(e.target.value, scene.planned_duration));
              }}
            />
          </label>
          <label className="block">
            <span className="text-sm text-muted">End</span>
            <input type="time" className={input} value={end} disabled={!!booked} onChange={(e) => setEnd(e.target.value)} />
          </label>
        </div>
        {!!start && !!end && end <= start && (
          <p role="alert" className="mt-2 text-sm text-alert">End time must be after start time (no overnight shoots).</p>
        )}
      </section>

      {/* Step 3: location */}
      <section className="mt-10" aria-labelledby="s3">
        <h2 id="s3" className="font-display text-xl font-semibold mb-3">3. Location</h2>
        {booked ? (
          <div className="rounded-sm border border-rule bg-panel p-4">
            <p className="font-medium">{booked.location}</p>
            <p className="text-sm text-muted">
              {labelDay(booked.date, { weekday: "long", day: "numeric", month: "long" })}, {booked.start} to {booked.end}
              {" "}(booking #{booked.schedule_id})
            </p>
            <div className="mt-3 flex gap-3">
              <button className={secondary} onClick={cancelBooking} disabled={busy}>Cancel booking</button>
              <button className={secondary} onClick={bookAnother} disabled={busy}>Book another scene</button>
            </div>
          </div>
        ) : !scene || !slotOk ? (
          <p className="text-muted">Choose a scene and a valid slot to see free locations.</p>
        ) : locs === null ? (
          <p className="text-muted">Checking which locations are free</p>
        ) : locs.length === 0 ? (
          <p className="text-muted">
            No free {scene.required_location_type ? label(scene.required_location_type) : ""} locations for that slot.
            Try another time or date.
          </p>
        ) : (
          <>
            <ul className="grid gap-2 sm:grid-cols-2">
              {locs.map((l) => (
                <li key={l.location_id}>
                  <button
                    type="button"
                    aria-pressed={locId === l.location_id}
                    onClick={() => setLocId(l.location_id)}
                    className={`w-full rounded-sm border-2 px-4 py-3 text-left ${
                      locId === l.location_id ? "border-tape bg-panel" : "border-rule hover:bg-panel"
                    }`}
                  >
                    <span className="block font-medium">{l.name}</span>
                    <span className="block text-sm text-muted">
                      {label(l.type)}
                      {l.capacity ? `, capacity ${l.capacity}` : ""}
                      {l.rental_price !== null ? `, ${rupees(l.rental_price)} per hour` : ""}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            <button className={`${primary} mt-4`} onClick={bookLocation} disabled={busy || locId === null}>
              {busy ? "Booking" : "Book this location"}
            </button>
          </>
        )}
      </section>

      {/* Step 4: equipment */}
      <section className="mt-10" aria-labelledby="s4">
        <h2 id="s4" className="font-display text-xl font-semibold mb-3">4. Equipment</h2>
        {!booked ? (
          <p className="text-muted">Book the location first, then add equipment to that slot.</p>
        ) : equip.length === 0 ? (
          <p className="text-muted">No more equipment is free for this slot.</p>
        ) : (
          <>
            <p className="mb-3 text-sm text-muted">
              Only items that are available and free for this slot are listed. If any item cannot be booked,
              none of the selected items are booked.
            </p>
            {Object.entries(byCategory).map(([cat, items]) => (
              <fieldset key={cat} className="mb-4">
                <legend className="mb-1 text-sm font-semibold uppercase tracking-wide text-muted">{cat}</legend>
                <ul className="grid gap-1 sm:grid-cols-2">
                  {items.map((e) => (
                    <li key={e.equipment_id}>
                      <label className="flex cursor-pointer items-start gap-2 rounded-sm px-2 py-1.5 hover:bg-panel">
                        <input
                          type="checkbox"
                          className="mt-1"
                          checked={picked.includes(e.equipment_id)}
                          onChange={() => togglePick(e.equipment_id)}
                        />
                        <span>
                          {e.name}
                          <span className="block text-sm text-muted">
                            {e.serial_number}
                            {e.rental_price !== null ? `, ${rupees(e.rental_price)} per hour` : ""}
                          </span>
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              </fieldset>
            ))}
            <button className={primary} onClick={bookEquipment} disabled={busy || picked.length === 0}>
              {busy ? "Booking" : `Book ${picked.length || ""} selected`.replace("  ", " ")}
            </button>
          </>
        )}
      </section>
    </div>
  );
}
