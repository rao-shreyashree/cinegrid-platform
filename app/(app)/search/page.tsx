"use client";
import { useState } from "react";
import Link from "next/link";

type Kind = "location" | "equipment" | "scene";
type Result = {
  id: number; score: number; description: string | null;
  name?: string; type?: string; category?: string; status?: string; available?: boolean;
  capacity?: number | null; rental_price?: number | null;
  scene_number?: number; production?: string; priority?: string | null; required_location_type?: string | null;
};

const KINDS: { id: Kind; label: string }[] = [
  { id: "location", label: "Locations" },
  { id: "equipment", label: "Equipment" },
  { id: "scene", label: "Scenes" },
];

const EXAMPLES: Record<Kind, string[]> = {
  location: ["night-time urban chase with wide roads", "historical village with old buildings and an open road", "hospital corridor for a medical drama"],
  equipment: ["camera for slow motion action shots", "soft lighting for interviews", "wireless audio for a moving crowd scene"],
  scene: ["tense confrontation at night", "car chase through narrow streets", "quiet family dinner"],
};

const nice = (s?: string | null) => (s ? s.replace(/_/g, " ").toLowerCase() : "");

export default function SearchPage() {
  const [kind, setKind] = useState<Kind>("location");
  const [q, setQ] = useState("");
  const [type, setType] = useState("");
  const [date, setDate] = useState("");
  const [from, setFrom] = useState("09:00");
  const [to, setTo] = useState("17:00");
  const [results, setResults] = useState<Result[] | null>(null);
  const [took, setTook] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const usesSlot = kind !== "scene";
  const slotOn = usesSlot && date !== "";

  async function run(text = q) {
    if (text.trim().length < 3) { setError("Describe what you need in a few words."); return; }
    setLoading(true); setError("");
    try {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: text, kind,
          ...(kind === "location" && type ? { type } : {}),
          ...(slotOn ? { date, from, to } : {}),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.issues?.[0]?.message ?? data.error ?? "Search failed"); setResults(null); return; }
      setResults(data.results); setTook(data.took_ms);
    } catch {
      setError("Could not reach the server."); setResults(null);
    } finally {
      setLoading(false);
    }
  }

  const field = "border border-rule bg-transparent px-3 py-2 rounded-sm";

  return (
    <div className="max-w-3xl">
      <h1 className="font-display text-4xl font-bold tracking-tight">Find by description</h1>
      <p className="mt-1 text-muted">Describe what the shoot needs. Results are ranked by meaning, then checked against the schedule.</p>

      <div role="tablist" aria-label="What to search" className="mt-6 flex gap-5 border-b border-rule">
        {KINDS.map((k) => (
          <button key={k.id} role="tab" aria-selected={kind === k.id}
            onClick={() => { setKind(k.id); setResults(null); setError(""); }}
            className={"pb-2 font-display text-lg -mb-px border-b-2 " + (kind === k.id ? "border-current font-semibold" : "border-transparent text-muted")}>
            {k.label}
          </button>
        ))}
      </div>

      <form className="mt-5 space-y-4" onSubmit={(e) => { e.preventDefault(); run(); }}>
        <div>
          <label htmlFor="q" className="block text-sm text-muted mb-1">What do you need?</label>
          <textarea id="q" rows={2} value={q} onChange={(e) => setQ(e.target.value)} maxLength={300}
            placeholder={EXAMPLES[kind][0]} className={field + " w-full"} />
          <div className="mt-2 flex flex-wrap gap-2">
            {EXAMPLES[kind].map((ex) => (
              <button type="button" key={ex} onClick={() => { setQ(ex); run(ex); }}
                className="text-sm border border-rule rounded-sm px-2 py-1 text-muted hover:text-current">{ex}</button>
            ))}
          </div>
        </div>

        {usesSlot && (
          <fieldset className="flex flex-wrap items-end gap-4">
            <legend className="text-sm text-muted mb-1">Only show what is free for a slot (optional)</legend>
            <label className="text-sm">Date<input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={field + " block mt-1"} /></label>
            <label className="text-sm">From<input type="time" value={from} onChange={(e) => setFrom(e.target.value)} disabled={!date} className={field + " block mt-1"} /></label>
            <label className="text-sm">To<input type="time" value={to} onChange={(e) => setTo(e.target.value)} disabled={!date} className={field + " block mt-1"} /></label>
            {kind === "location" && (
              <label className="text-sm">Type
                <select value={type} onChange={(e) => setType(e.target.value)} className={field + " block mt-1"}>
                  <option value="">Any</option>
                  {["studio", "sound_stage", "outdoor", "backlot", "set"].map((t) => <option key={t} value={t}>{nice(t)}</option>)}
                </select>
              </label>
            )}
          </fieldset>
        )}

        <button type="submit" disabled={loading} className="bg-neutral-900 text-white px-5 py-2 rounded-sm font-semibold disabled:opacity-60">
          {loading ? "Searching" : "Search"}
        </button>
      </form>

      {loading && <p className="mt-4 text-muted">The first search after a server start loads the model and can take a few seconds.</p>}
      {error && <p role="alert" className="mt-6 text-alert">{error}</p>}

      {results && (
        <section className="mt-8" aria-live="polite">
          <p className="text-sm text-muted mb-1">
            {results.length === 0 ? "Nothing matched" : `${results.length} results`}
            {slotOn && " free for that slot"} in {took} ms
          </p>
          {results.length === 0 && slotOn && <p className="py-4">Nothing free for that slot. Try another time, or clear the date.</p>}
          <ul>
            {results.map((r) => (
              <li key={r.id} className="border-t border-rule py-4">
                <div className="flex items-baseline justify-between gap-4">
                  <h3 className="font-display text-xl font-semibold">
                    {kind === "scene" ? `${r.production}, scene ${r.scene_number}` : r.name}
                  </h3>
                  <span className="tabular-nums font-display text-lg" title="Cosine similarity">{Math.round(r.score * 100)}%</span>
                </div>
                <div className="mt-1 h-1 bg-neutral-300" aria-hidden><div className="h-1 bg-neutral-900" style={{ width: `${Math.max(0, Math.min(100, r.score * 100))}%` }} /></div>
                <p className="mt-2 text-sm text-muted">
                  {kind === "scene"
                    ? [nice(r.status), r.priority && `${nice(r.priority)} priority`, r.required_location_type && `needs ${nice(r.required_location_type)}`].filter(Boolean).join(", ")
                    : [nice(r.type ?? r.category), slotOn ? "free for this slot" : nice(r.status),
                       r.capacity ? `capacity ${r.capacity}` : null,
                       r.rental_price != null ? `₹${r.rental_price.toLocaleString("en-IN")} per hour` : null].filter(Boolean).join(", ")}
                </p>
                {r.description && <p className="mt-2 max-w-prose">{r.description}</p>}
                {kind === "location" && r.available && (
                  <Link href="/bookings" className="mt-2 inline-block text-sm font-semibold underline">Book this location</Link>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
