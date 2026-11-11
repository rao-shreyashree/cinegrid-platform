"use client";
import { useEffect, useState } from "react";
import { api, errText, TAPE } from "../finance/shared";

type Item = {
  scene_id: number;
  production: string;
  scene_number: number;
  description: string | null;
  day_label: string | null;
  starts_at: string | null;
  ends_at: string | null;
  location: string | null;
  shoot_status: string | null;
  bucket: "today" | "upcoming" | "past" | "unscheduled";
};
type Data = { person: { name: string; crew_role: string | null } | null; items: Item[] };

const SECTIONS: { key: Item["bucket"]; title: string; empty: string }[] = [
  { key: "today", title: "Today", empty: "Nothing on your call sheet today." },
  { key: "upcoming", title: "Coming up", empty: "No upcoming shoots yet." },
  { key: "unscheduled", title: "Assigned, no date yet", empty: "" },
  { key: "past", title: "Earlier", empty: "" },
];

export default function MyWorkPage() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api<Data>("/api/my-work").then(setData).catch((e) => setError(errText(e)));
  }, []);

  return (
    <div className="max-w-4xl">
      <h1 className="font-display text-4xl font-bold tracking-tight">My schedule</h1>
      {data?.person && (
        <p className="mt-1 text-muted">{data.person.name}{data.person.crew_role ? `, ${data.person.crew_role}` : ""}</p>
      )}

      {error && <p role="alert" className="mt-8 text-alert">{error}</p>}
      {!data && !error && <p className="mt-8 text-muted">Loading your scenes</p>}
      {data && !data.person && (
        <p className="mt-8 max-w-prose">
          Your login is not linked to a crew record yet, so there are no scenes to show. Ask an admin to link it.
        </p>
      )}

      {data?.person && data.items.length === 0 && (
        <p className="mt-8 max-w-prose">You have not been assigned to any scenes yet. They will appear here once a production manager books you.</p>
      )}

      {data?.person &&
        SECTIONS.map((sec) => {
          let items = data.items.filter((i) => i.bucket === sec.key);
          if (sec.key === "past") items = [...items].reverse();
          if (items.length === 0 && (sec.key === "unscheduled" || sec.key === "past")) return null;
          if (items.length === 0 && data.items.length === 0) return null;
          return (
            <section key={sec.key} className="mt-10" aria-labelledby={`sec-${sec.key}`}>
              <h2 id={`sec-${sec.key}`} className="font-display text-xl font-semibold">{sec.title}</h2>
              {items.length === 0 ? (
                <p className="mt-3 text-muted">{sec.empty}</p>
              ) : (
                <ul className="mt-3">
                  {items.map((i, idx) => (
                    <li
                      key={`${i.scene_id}-${idx}`}
                      className="grid grid-cols-[7.5rem_1fr] gap-x-6 border-t border-rule py-4"
                      style={sec.key === "today" ? { borderLeft: `6px solid ${TAPE.yellow}`, paddingLeft: "1rem" } : undefined}
                    >
                      <div className="tabular-nums">
                        <div className="font-display font-semibold">{i.day_label ?? "No date"}</div>
                        {i.starts_at && <div className="text-sm text-muted">{i.starts_at} to {i.ends_at}</div>}
                      </div>
                      <div>
                        <div className="font-medium">{i.production}, scene {i.scene_number}</div>
                        {i.location && <div className="text-sm">{i.location}</div>}
                        {i.description && <p className="mt-1 max-w-prose text-sm text-muted">{i.description}</p>}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
    </div>
  );
}
