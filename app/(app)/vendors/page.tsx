"use client";
import { useCallback, useEffect, useState } from "react";

const TYPES = ["catering", "transport", "security", "costume", "makeup", "vfx", "power", "props", "other"];
const STATUSES = ["REQUESTED", "CONFIRMED", "COMPLETED", "CANCELLED"];

type Vendor = { vendor_id: number; name: string; vendor_type: string; contact_info: string | null; bookings: number; total_spend: number };
type Booking = {
  id: number; production: string; vendor: string; vendor_type: string; service_name: string;
  starts_at: string; ends_at: string; charge: number; status: string; invoiced: boolean;
};
type Options = { productions: { production_id: number; title: string }[]; vendors: { vendor_id: number; name: string; vendor_type: string }[] };

const nice = (s: string) => s.replace(/_/g, " ").toLowerCase();
const inr = (n: number) => "₹" + n.toLocaleString("en-IN");
const field = "border border-rule bg-transparent px-3 py-2 rounded-sm";
const smallBtn = "text-sm border border-rule rounded-sm px-2 py-1 hover:bg-neutral-200 disabled:opacity-50";
const primaryBtn = "bg-neutral-900 text-white px-4 py-2 rounded-sm font-semibold disabled:opacity-60";

async function api(url: string, init?: RequestInit) {
  const res = await fetch(url, init);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.issues?.[0]?.message ?? data.error ?? "Request failed");
  return data;
}
const send = (method: string, body: unknown): RequestInit => ({
  method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
});

export default function VendorsPage() {
  const [tab, setTab] = useState<"vendors" | "bookings">("bookings");
  return (
    <div className="max-w-5xl">
      <h1 className="font-display text-4xl font-bold tracking-tight">Vendors and services</h1>
      <p className="mt-1 text-muted">Catering, transport, security and other support booked for productions.</p>
      <div role="tablist" className="mt-6 flex gap-5 border-b border-rule">
        {(["bookings", "vendors"] as const).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
            className={"pb-2 font-display text-lg -mb-px border-b-2 " + (tab === t ? "border-current font-semibold" : "border-transparent text-muted")}>
            {t === "bookings" ? "Service bookings" : "Vendors"}
          </button>
        ))}
      </div>
      {tab === "vendors" ? <VendorsTab /> : <BookingsTab />}
    </div>
  );
}

/* ---------------- Vendors ---------------- */
function VendorsTab() {
  const [q, setQ] = useState("");
  const [type, setType] = useState("");
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState<{ id?: number; name: string; vendor_type: string; contact_info: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const p = new URLSearchParams();
      if (q.trim()) p.set("q", q.trim());
      if (type) p.set("type", type);
      const d = await api("/api/vendors?" + p);
      setVendors(d.vendors); setCanManage(d.can_manage); setError("");
    } catch (e) { setError((e as Error).message); }
  }, [q, type]);

  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    setBusy(true);
    try {
      const body = { name: form.name, vendor_type: form.vendor_type, ...(form.contact_info ? { contact_info: form.contact_info } : {}) };
      await api(form.id ? `/api/vendors/${form.id}` : "/api/vendors", send(form.id ? "PATCH" : "POST", body));
      setForm(null); await load();
    } catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  }

  return (
    <section className="mt-5">
      <div className="flex flex-wrap items-end gap-4">
        <label className="text-sm">Search<input value={q} onChange={(e) => setQ(e.target.value)} className={field + " block mt-1"} placeholder="Vendor name" /></label>
        <label className="text-sm">Type
          <select value={type} onChange={(e) => setType(e.target.value)} className={field + " block mt-1"}>
            <option value="">All</option>{TYPES.map((t) => <option key={t} value={t}>{nice(t)}</option>)}
          </select>
        </label>
        {canManage && !form && <button className={primaryBtn} onClick={() => setForm({ name: "", vendor_type: "catering", contact_info: "" })}>Add vendor</button>}
      </div>

      {form && (
        <form onSubmit={save} className="mt-5 flex flex-wrap items-end gap-4 border border-rule rounded-sm p-4">
          <label className="text-sm">Name<input required minLength={2} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={field + " block mt-1"} /></label>
          <label className="text-sm">Type
            <select value={form.vendor_type} onChange={(e) => setForm({ ...form, vendor_type: e.target.value })} className={field + " block mt-1"}>
              {TYPES.map((t) => <option key={t} value={t}>{nice(t)}</option>)}
            </select>
          </label>
          <label className="text-sm">Contact<input value={form.contact_info} onChange={(e) => setForm({ ...form, contact_info: e.target.value })} className={field + " block mt-1"} /></label>
          <button className={primaryBtn} disabled={busy}>{form.id ? "Save changes" : "Add vendor"}</button>
          <button type="button" className={smallBtn} onClick={() => setForm(null)}>Cancel</button>
        </form>
      )}

      {error && <p role="alert" className="mt-4 text-alert">{error}</p>}

      <ul className="mt-6">
        {vendors.map((v) => (
          <li key={v.vendor_id} className="flex flex-wrap items-baseline justify-between gap-4 border-t border-rule py-3">
            <div>
              <p className="font-display text-lg font-semibold">{v.name}</p>
              <p className="text-sm text-muted">{nice(v.vendor_type)}{v.contact_info ? `, ${v.contact_info}` : ""}</p>
            </div>
            <div className="flex items-baseline gap-5">
              <p className="text-sm text-muted tabular-nums">{v.bookings} bookings, <span className="text-current font-semibold">{inr(v.total_spend)}</span></p>
              {canManage && <button className={smallBtn} onClick={() => setForm({ id: v.vendor_id, name: v.name, vendor_type: v.vendor_type, contact_info: v.contact_info ?? "" })}>Edit</button>}
            </div>
          </li>
        ))}
        {vendors.length === 0 && !error && <li className="border-t border-rule py-4 text-muted">No vendors match.</li>}
      </ul>
    </section>
  );
}

/* ---------------- Service bookings ---------------- */
function BookingsTab() {
  const [status, setStatus] = useState("");
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [options, setOptions] = useState<Options>({ productions: [], vendors: [] });
  const [canManage, setCanManage] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({ production_id: "", vendor_id: "", service_name: "", start_time: "", end_time: "", charge: "" });

  const load = useCallback(async () => {
    try {
      const d = await api("/api/service-bookings" + (status ? `?status=${status}` : ""));
      setBookings(d.bookings); setOptions(d.options); setCanManage(d.can_manage); setError("");
    } catch (e) { setError((e as Error).message); }
  }, [status]);
  useEffect(() => { load(); }, [load]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setNotice(""); setError("");
    try {
      const d = await api("/api/service-bookings", send("POST", {
        production_id: Number(f.production_id), vendor_id: Number(f.vendor_id), service_name: f.service_name,
        start_time: f.start_time, end_time: f.end_time, charge: Number(f.charge),
      }));
      setNotice(d.over_budget
        ? `Requested. Heads up: this production is now over budget (${inr(d.total_cost)} against ${inr(d.budget)}).`
        : "Requested. An admin needs to confirm it.");
      setF({ ...f, service_name: "", charge: "" });
      await load();
    } catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  }

  async function change(id: number, next: string) {
    setNotice(""); setError("");
    try { await api(`/api/service-bookings/${id}`, send("PATCH", { status: next })); await load(); }
    catch (err) { setError((err as Error).message); }
  }

  return (
    <section className="mt-5">
      <form onSubmit={create} className="flex flex-wrap items-end gap-4 border border-rule rounded-sm p-4">
        <label className="text-sm">Production
          <select required value={f.production_id} onChange={(e) => setF({ ...f, production_id: e.target.value })} className={field + " block mt-1"}>
            <option value="">Choose</option>{options.productions.map((p) => <option key={p.production_id} value={p.production_id}>{p.title}</option>)}
          </select>
        </label>
        <label className="text-sm">Vendor
          <select required value={f.vendor_id} onChange={(e) => setF({ ...f, vendor_id: e.target.value })} className={field + " block mt-1"}>
            <option value="">Choose</option>{options.vendors.map((v) => <option key={v.vendor_id} value={v.vendor_id}>{v.name} ({nice(v.vendor_type)})</option>)}
          </select>
        </label>
        <label className="text-sm">Service<input required minLength={2} value={f.service_name} onChange={(e) => setF({ ...f, service_name: e.target.value })} className={field + " block mt-1"} placeholder="Lunch for 80 crew" /></label>
        <label className="text-sm">Start<input required type="datetime-local" value={f.start_time} onChange={(e) => setF({ ...f, start_time: e.target.value })} className={field + " block mt-1"} /></label>
        <label className="text-sm">End<input required type="datetime-local" value={f.end_time} onChange={(e) => setF({ ...f, end_time: e.target.value })} className={field + " block mt-1"} /></label>
        <label className="text-sm">Charge (₹)<input required type="number" min={0} step="0.01" value={f.charge} onChange={(e) => setF({ ...f, charge: e.target.value })} className={field + " block mt-1 w-32"} /></label>
        <button className={primaryBtn} disabled={busy}>Request service</button>
      </form>

      {notice && <p role="status" className="mt-4">{notice}</p>}
      {error && <p role="alert" className="mt-4 text-alert">{error}</p>}

      <label className="mt-6 block text-sm">Status
        <select value={status} onChange={(e) => setStatus(e.target.value)} className={field + " block mt-1"}>
          <option value="">All</option>{STATUSES.map((s) => <option key={s} value={s}>{nice(s)}</option>)}
        </select>
      </label>

      <ul className="mt-4">
        {bookings.map((b) => (
          <li key={b.id} className="flex flex-wrap items-baseline justify-between gap-4 border-t border-rule py-3">
            <div>
              <p className="font-display text-lg font-semibold">{b.service_name}</p>
              <p className="text-sm text-muted">{b.production}, {b.vendor} ({nice(b.vendor_type)})</p>
              <p className="text-sm text-muted">{b.starts_at} to {b.ends_at}</p>
            </div>
            <div className="flex items-baseline gap-4">
              <p className="tabular-nums font-semibold">{inr(b.charge)}</p>
              <p className="text-sm w-28">{nice(b.status)}{b.invoiced ? ", invoiced" : ""}</p>
              {canManage && b.status === "REQUESTED" && <button className={smallBtn} onClick={() => change(b.id, "CONFIRMED")}>Confirm</button>}
              {canManage && b.status === "CONFIRMED" && <button className={smallBtn} onClick={() => change(b.id, "COMPLETED")}>Complete</button>}
              {(b.status === "REQUESTED" || b.status === "CONFIRMED") && !b.invoiced &&
                <button className={smallBtn} onClick={() => change(b.id, "CANCELLED")}>Cancel</button>}
            </div>
          </li>
        ))}
        {bookings.length === 0 && !error && <li className="border-t border-rule py-4 text-muted">No service bookings yet.</li>}
      </ul>
    </section>
  );
}
