"use client";
import { useEffect, useState } from "react";
import DayBoard, { Shoot } from "./DayBoard";

type Stats = {
  active_productions: number;
  todays_shoots: number;
  equipment_in_use: number;
  open_incidents: number;
  outstanding_amount: number | null;
  today: Shoot[];
};

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/dashboard")
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then(setStats)
      .catch(() => setError("Could not load the dashboard. Check that the database is running, then refresh."));
  }, []);

  const dateLabel = new Intl.DateTimeFormat("en-IN", { weekday: "long", day: "numeric", month: "long" }).format(new Date());

  const rows: [string, string][] = stats
    ? [
        ["Productions in progress", String(stats.active_productions)],
        ["Shoots today", String(stats.todays_shoots)],
        ["Equipment on set right now", String(stats.equipment_in_use)],
        ["Open incidents", String(stats.open_incidents)],
        ...(stats.outstanding_amount !== null
          ? ([["Unpaid invoices", "₹" + stats.outstanding_amount.toLocaleString("en-IN")]] as [string, string][])
          : []),
      ]
    : [];

  return (
    <div className="max-w-5xl">
      <h1 className="font-display text-4xl font-bold tracking-tight">Today on the lot</h1>
      <p className="mt-1 text-muted">{dateLabel}</p>

      {error && <p role="alert" className="mt-8 text-alert">{error}</p>}
      {!stats && !error && <p className="mt-8 text-muted">Loading the schedule</p>}

      {stats && (
        <>
          <section className="mt-8" aria-labelledby="board-h">
            <h2 id="board-h" className="sr-only">Shooting schedule by location</h2>
            <DayBoard shoots={stats.today} />
          </section>

          <section className="mt-12 max-w-md" aria-labelledby="city-h">
            <h2 id="city-h" className="font-display text-xl font-semibold mb-2">Across the film city</h2>
            <dl>
              {rows.map(([label, value]) => (
                <div key={label} className="flex items-baseline justify-between gap-6 border-t border-rule py-2.5">
                  <dt className="text-muted">{label}</dt>
                  <dd className="font-display text-xl font-semibold tabular-nums">{value}</dd>
                </div>
              ))}
            </dl>
          </section>
        </>
      )}
    </div>
  );
}
