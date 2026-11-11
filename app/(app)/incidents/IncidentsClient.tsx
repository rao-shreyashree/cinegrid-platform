"use client";
import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { api } from "@/lib/client";

type Incident = {
  incident_id: number;
  type: string;
  status: string;
  description: string;
  resolution_notes: string | null;
  equipment: string | null;
  location: string | null;
  reported_by: string | null;
  reported_at: string;
  resolved_at: string | null;
};
type EquipOpt = { equipment_id: number; name: string; category: string; current_status: string };
type LocOpt = { location_id: number; name: string; type: string; status: string };
type Msg = { kind: "ok" | "error"; text: string };

const TYPES: [string, string][] = [
  ["equipment_damage", "Equipment damage"],
  ["location_damage", "Location damage"],
  ["safety", "Safety"],
  ["operational", "Operational"],
];
const typeLabel = (t: string) => TYPES.find(([v]) => v === t)?.[1] ?? t;
const STATUS_LABEL: Record<string, string> = { OPEN: "Open", IN_PROGRESS: "In progress", RESOLVED: "Resolved" };
const BADGE: Record<string, string> = {
  OPEN: "border-alert text-alert",
  IN_PROGRESS: "border-tape-dark text-ink",
  RESOLVED: "border-rule text-muted",
};

const field = "w-full rounded-sm border border-rule bg-panel px-3 py-2";
const primary =
  "rounded-sm bg-ink px-4 py-2 font-medium text-chalk hover:bg-slate disabled:cursor-not-allowed disabled:opacity-40";
const secondary = "rounded-sm border border-rule px-3 py-1.5 text-sm font-medium hover:bg-panel disabled:opacity-40";

export default function IncidentsClient({ canManage }: { canManage: boolean }) {
  const [items, setItems] = useState<Incident[] | null>(null);
  const [statusFilter, setStatusFilter] = useState("open"); // "open" = not resolved
  const [typeFilter, setTypeFilter] = useState("");
  const [tick, setTick] = useState(0);
  const [msg, setMsg] = useState<Msg | null>(null);
  const [busy, setBusy] = useState(false);

  // report form
  const [showForm, setShowForm] = useState(false);
  const [type, setType] = useState("equipment_damage");
  const [equipmentId, setEquipmentId] = useState("");
  const [locationId, setLocationId] = useState("");
  const [description, setDescription] = useState("");
  const [equipment, setEquipment] = useState<EquipOpt[]>([]);
  const [locations, setLocations] = useState<LocOpt[]>([]);

  // resolve flow
  const [resolvingId, setResolvingId] = useState<number | null>(null);
  const [notes, setNotes] = useState("");

  const loadRefs = useCallback(async () => {
    const [e, l] = await Promise.all([
      api<{ equipment: EquipOpt[] }>("/api/equipment"),
      api<{ locations: LocOpt[] }>("/api/locations"),
    ]);
    if (e.ok) setEquipment(e.data.equipment);
    if (l.ok) setLocations(l.data.locations);
  }, []);

  useEffect(() => {
    loadRefs();
  }, [loadRefs]);

  useEffect(() => {
    let live = true;
    setItems(null);
    const qs = new URLSearchParams();
    if (statusFilter) qs.set("status", statusFilter);
    if (typeFilter) qs.set("type", typeFilter);
    const q = qs.toString();
    api<{ incidents: Incident[] }>(`/api/incidents${q ? "?" + q : ""}`).then((r) => {
      if (!live) return;
      if (r.ok) setItems(r.data.incidents);
      else setMsg({ kind: "error", text: r.error });
    });
    return () => {
      live = false;
    };
  }, [statusFilter, typeFilter, tick]);

  const equipByCategory: Record<string, EquipOpt[]> = {};
  for (const e of equipment) (equipByCategory[e.category] ||= []).push(e);

  async function report(ev: FormEvent) {
    ev.preventDefault();
    setMsg(null);
    if (!description.trim()) {
      setMsg({ kind: "error", text: "Describe what happened." });
      return;
    }
    if (type === "equipment_damage" && !equipmentId) {
      setMsg({ kind: "error", text: "Choose the damaged equipment." });
      return;
    }
    if (type === "location_damage" && !locationId) {
      setMsg({ kind: "error", text: "Choose the damaged location." });
      return;
    }
    setBusy(true);
    const r = await api<{ incident_id: number }>("/api/incidents", {
      method: "POST",
      body: {
        type,
        equipment_id: type === "equipment_damage" ? Number(equipmentId) : undefined,
        location_id: type === "location_damage" ? Number(locationId) : undefined,
        description: description.trim(),
      },
    });
    setBusy(false);
    if (!r.ok) {
      setMsg({ kind: "error", text: r.error });
      return;
    }
    let extra = "";
    if (type === "equipment_damage") {
      const name = equipment.find((e) => String(e.equipment_id) === equipmentId)?.name ?? "The equipment";
      extra = ` ${name} is now under maintenance and cannot be booked until this is resolved.`;
    } else if (type === "location_damage") {
      const name = locations.find((l) => String(l.location_id) === locationId)?.name ?? "The location";
      extra = ` ${name} is now under maintenance and cannot be booked until this is resolved.`;
    }
    setMsg({ kind: "ok", text: `Incident #${r.data.incident_id} reported.${extra}` });
    setDescription("");
    setEquipmentId("");
    setLocationId("");
    setShowForm(false);
    setStatusFilter("open");
    setTypeFilter("");
    setTick((t) => t + 1);
    loadRefs();
  }

  async function move(id: number, status: "IN_PROGRESS" | "RESOLVED", resolutionNotes?: string) {
    setBusy(true);
    setMsg(null);
    const r = await api(`/api/incidents/${id}`, {
      method: "PATCH",
      body: { status, resolution_notes: resolutionNotes || undefined },
    });
    setBusy(false);
    if (!r.ok) {
      setMsg({ kind: "error", text: r.error });
      return;
    }
    setMsg({
      kind: "ok",
      text:
        status === "RESOLVED"
          ? `Incident #${id} resolved. Damaged equipment or locations go back to available unless another open damage report remains on them.`
          : `Incident #${id} marked in progress.`,
    });
    setResolvingId(null);
    setNotes("");
    setTick((t) => t + 1);
    loadRefs();
  }

  return (
    <div className="max-w-4xl">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl font-bold tracking-tight">Incidents</h1>
          <p className="mt-1 text-muted">Damage, safety and operational problems on the lot.</p>
        </div>
        <button className={primary} onClick={() => setShowForm((s) => !s)} aria-expanded={showForm}>
          {showForm ? "Close form" : "Report an incident"}
        </button>
      </div>

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

      {showForm && (
        <form onSubmit={report} className="mt-6 space-y-4 rounded-sm border border-rule bg-panel p-5">
          <h2 className="font-display text-xl font-semibold">Report an incident</h2>
          <label className="block">
            <span className="text-sm text-muted">Type</span>
            <select className={field} value={type} onChange={(e) => setType(e.target.value)}>
              {TYPES.map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </label>

          {type === "equipment_damage" && (
            <label className="block">
              <span className="text-sm text-muted">Damaged equipment</span>
              <select className={field} value={equipmentId} onChange={(e) => setEquipmentId(e.target.value)}>
                <option value="">Choose equipment</option>
                {Object.entries(equipByCategory).map(([cat, list]) => (
                  <optgroup key={cat} label={cat}>
                    {list.map((e) => (
                      <option key={e.equipment_id} value={e.equipment_id}>
                        {e.name}
                        {e.current_status === "MAINTENANCE" ? " (already under maintenance)" : ""}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </label>
          )}

          {type === "location_damage" && (
            <label className="block">
              <span className="text-sm text-muted">Damaged location</span>
              <select className={field} value={locationId} onChange={(e) => setLocationId(e.target.value)}>
                <option value="">Choose a location</option>
                {locations.map((l) => (
                  <option key={l.location_id} value={l.location_id}>
                    {l.name}
                    {l.status === "MAINTENANCE" ? " (already under maintenance)" : ""}
                  </option>
                ))}
              </select>
            </label>
          )}

          <label className="block">
            <span className="text-sm text-muted">What happened</span>
            <textarea className={field} rows={3} maxLength={2000} value={description} onChange={(e) => setDescription(e.target.value)} />
          </label>

          {(type === "equipment_damage" || type === "location_damage") && (
            <p className="text-sm text-muted">
              A damage report puts the item under maintenance straight away, so it cannot be booked until the incident is resolved.
            </p>
          )}
          <button type="submit" className={primary} disabled={busy}>
            {busy ? "Sending" : "Submit report"}
          </button>
        </form>
      )}

      <div className="mt-8 flex flex-wrap gap-4">
        <label className="text-sm text-muted">
          Status
          <select className={`${field} mt-1`} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="open">Not resolved</option>
            <option value="OPEN">Open</option>
            <option value="IN_PROGRESS">In progress</option>
            <option value="RESOLVED">Resolved</option>
            <option value="">All</option>
          </select>
        </label>
        <label className="text-sm text-muted">
          Type
          <select className={`${field} mt-1`} value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
            <option value="">All types</option>
            {TYPES.map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </label>
      </div>

      <section className="mt-6" aria-label="Incident list">
        {!items ? (
          <p className="text-muted">Loading incidents</p>
        ) : items.length === 0 ? (
          <p className="text-muted">No incidents match these filters.</p>
        ) : (
          <ul className="space-y-3">
            {items.map((i) => (
              <li key={i.incident_id} className="rounded-sm border border-rule bg-panel p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-sm border px-2 py-0.5 text-xs font-semibold uppercase tracking-wide ${BADGE[i.status] ?? "border-rule"}`}>
                    {STATUS_LABEL[i.status] ?? i.status}
                  </span>
                  <span className="font-semibold">{typeLabel(i.type)}</span>
                  {(i.equipment || i.location) && <span className="text-muted">{i.equipment ?? i.location}</span>}
                  <span className="ml-auto text-sm text-muted tabular-nums">#{i.incident_id}</span>
                </div>
                <p className="mt-2">{i.description}</p>
                <p className="mt-1 text-sm text-muted">
                  Reported {i.reported_at}
                  {i.reported_by ? ` by ${i.reported_by}` : ""}
                  {i.resolved_at ? `, resolved ${i.resolved_at}` : ""}
                </p>
                {i.resolution_notes && <p className="mt-1 text-sm">Resolution: {i.resolution_notes}</p>}

                {canManage && i.status !== "RESOLVED" && (
                  <div className="mt-3">
                    {resolvingId === i.incident_id ? (
                      <div className="space-y-2">
                        <label className="block text-sm text-muted">
                          Resolution notes (optional)
                          <textarea
                            className={`${field} mt-1`}
                            rows={2}
                            maxLength={2000}
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                          />
                        </label>
                        <div className="flex gap-2">
                          <button className={primary} disabled={busy} onClick={() => move(i.incident_id, "RESOLVED", notes.trim())}>
                            Mark resolved
                          </button>
                          <button className={secondary} disabled={busy} onClick={() => { setResolvingId(null); setNotes(""); }}>
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        {i.status === "OPEN" && (
                          <button className={secondary} disabled={busy} onClick={() => move(i.incident_id, "IN_PROGRESS")}>
                            Start work
                          </button>
                        )}
                        <button className={secondary} disabled={busy} onClick={() => { setResolvingId(i.incident_id); setNotes(""); }}>
                          Resolve
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
