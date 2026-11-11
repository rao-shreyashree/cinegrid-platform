"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { addDays, labelDay, todayISO, weekStart } from "@/lib/dates";

type Shoot = {
  schedule_id: number;
  shoot_date: string;
  starts_at: string;
  ends_at: string;
  status: string;
  location: string;
  production: string;
  scene_number: number;
};

// Same gaffer-tape colours as the dashboard: one colour per production, so overlapping work is easy to tell apart.
const TAPE = ["#f5c518", "#c93a6b", "#1f7f55", "#3b6fd8", "#f28c28"];
function tapeFor(name: string) {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return TAPE[h % TAPE.length];
}

const STATUS: Record<string, string> = {
  PLANNED: "Planned",
  CONFIRMED: "Confirmed",
  IN_PROGRESS: "In progress",
  COMPLETED: "Done",
};

const btn = "rounded-sm border border-rule px-3 py-1.5 text-sm font-medium hover:bg-panel";

function ShootCard({ s, showDate }: { s: Shoot; showDate?: boolean }) {
  return (
    <div className="rounded-sm border border-rule border-l-4 bg-panel px-3 py-2 text-sm" style={{ borderLeftColor: tapeFor(s.production) }}>
      <p className="font-semibold tabular-nums">
        {showDate ? `${labelDay(s.shoot_date)}, ` : ""}
        {s.starts_at} to {s.ends_at}
      </p>
      <p>{s.production}</p>
      <p className="text-muted">
        Scene {s.scene_number}, {s.location}
      </p>
      {s.status !== "PLANNED" && s.status !== "CONFIRMED" && (
        <p className="mt-1 text-xs font-medium uppercase tracking-wide text-muted">{STATUS[s.status] ?? s.status}</p>
      )}
    </div>
  );
}

export default function SchedulePage() {
  const [view, setView] = useState<"week" | "day">("week");
  const [anchor, setAnchor] = useState(todayISO());
  const [shoots, setShoots] = useState<Shoot[] | null>(null);
  const [error, setError] = useState("");

  const from = view === "week" ? weekStart(anchor) : anchor;
  const to = view === "week" ? addDays(from, 6) : anchor;
  const today = todayISO();

  useEffect(() => {
    setShoots(null);
    setError("");
    let live = true;
    api<{ shoots: Shoot[] }>(`/api/schedule?from=${from}&to=${to}`).then((r) => {
      if (!live) return;
      if (r.ok) setShoots(r.data.shoots);
      else setError(r.error);
    });
    return () => {
      live = false;
    };
  }, [from, to]);

  const step = view === "week" ? 7 : 1;
  const days = Array.from({ length: view === "week" ? 7 : 1 }, (_, i) => addDays(from, i));
  const byDay = (d: string) => (shoots ?? []).filter((s) => s.shoot_date === d);

  const title =
    view === "week"
      ? `${labelDay(from, { day: "numeric", month: "short" })} to ${labelDay(to, { day: "numeric", month: "short", year: "numeric" })}`
      : labelDay(anchor, { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  return (
    <div className="max-w-6xl">
      <h1 className="font-display text-4xl font-bold tracking-tight">Shooting calendar</h1>
      <p className="mt-1 text-muted">{title}</p>

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <div className="mr-2 flex" role="group" aria-label="View">
          {(["week", "day"] as const).map((v) => (
            <button
              key={v}
              aria-pressed={view === v}
              onClick={() => setView(v)}
              className={`border border-rule px-3 py-1.5 text-sm font-medium first:rounded-l-sm last:rounded-r-sm ${
                view === v ? "bg-ink text-chalk" : "hover:bg-panel"
              }`}
            >
              {v === "week" ? "Week" : "Day"}
            </button>
          ))}
        </div>
        <button className={btn} onClick={() => setAnchor(addDays(anchor, -step))}>Previous</button>
        <button className={btn} onClick={() => setAnchor(today)}>Today</button>
        <button className={btn} onClick={() => setAnchor(addDays(anchor, step))}>Next</button>
        <label className="ml-2 text-sm text-muted">
          <span className="sr-only">Jump to date</span>
          <input
            type="date"
            value={anchor}
            onChange={(e) => e.target.value && setAnchor(e.target.value)}
            className="rounded-sm border border-rule bg-panel px-2 py-1.5"
          />
        </label>
      </div>

      {error && <p role="alert" className="mt-8 text-alert">{error}</p>}
      {!shoots && !error && <p className="mt-8 text-muted">Loading the schedule</p>}

      {shoots && view === "week" && (
        <div className="mt-6 grid gap-3 md:grid-cols-7">
          {days.map((d) => {
            const list = byDay(d);
            return (
              <section key={d} aria-label={labelDay(d)} className="min-w-0">
                <h2
                  className={`mb-2 border-b-2 pb-1 text-sm font-semibold ${
                    d === today ? "border-tape" : "border-rule"
                  }`}
                >
                  {labelDay(d)}
                </h2>
                {list.length === 0 ? (
                  <p className="text-sm text-muted">No shoots</p>
                ) : (
                  <div className="space-y-2">
                    {list.map((s) => (
                      <ShootCard key={s.schedule_id} s={s} />
                    ))}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}

      {shoots && view === "day" && (
        <div className="mt-6 max-w-2xl">
          {shoots.length === 0 ? (
            <p className="text-muted">No shoots on this day.</p>
          ) : (
            <div className="space-y-2">
              {shoots.map((s) => (
                <ShootCard key={s.schedule_id} s={s} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
