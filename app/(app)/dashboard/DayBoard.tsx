"use client";
import { useEffect, useState } from "react";

export type Shoot = {
  schedule_id: number;
  location: string;
  production: string;
  scene_number: number;
  status: string;
  starts_at: string; // "HH:MM"
  ends_at: string;
};

// Each production gets one tape colour, so overlapping work on the lot is easy to tell apart.
const TAPE = [
  { bg: "#f5c518", fg: "#172033" },
  { bg: "#c93a6b", fg: "#ffffff" },
  { bg: "#1f7f55", fg: "#ffffff" },
  { bg: "#3b6fd8", fg: "#ffffff" },
  { bg: "#f28c28", fg: "#172033" },
];
function tapeFor(name: string) {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return TAPE[h % TAPE.length];
}
const toHours = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h + m / 60;
};

export default function DayBoard({ shoots }: { shoots: Shoot[] }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => {
      const d = new Date();
      setNow(d.getHours() + d.getMinutes() / 60);
    };
    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, []);

  if (shoots.length === 0) {
    return <p className="py-10 text-muted">Nothing is scheduled on the lot today.</p>;
  }

  const first = Math.min(6, Math.floor(Math.min(...shoots.map((s) => toHours(s.starts_at)))));
  const last = Math.min(24, Math.max(20, Math.ceil(Math.max(...shoots.map((s) => toHours(s.ends_at))))));
  const span = last - first;
  const pct = (h: number) => ((h - first) / span) * 100;
  const hours = Array.from({ length: span + 1 }, (_, i) => first + i);
  const rows = [...new Set(shoots.map((s) => s.location))];

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[760px] pr-8">
        {/* hour ruler */}
        <div className="grid grid-cols-[170px_1fr] text-xs text-muted">
          <div />
          <div className="relative h-6">
            {hours.map((h) => (
              <span key={h} className="absolute -translate-x-1/2" style={{ left: `${pct(h)}%` }}>
                {String(h % 24).padStart(2, "0")}:00
              </span>
            ))}
          </div>
        </div>

        {rows.map((loc) => (
          <div key={loc} className="grid grid-cols-[170px_1fr] items-center border-t border-rule">
            <div className="pr-3 py-3 text-sm font-medium truncate" title={loc}>{loc}</div>
            <div className="relative h-12">
              {hours.map((h) => (
                <span key={h} className="absolute top-0 bottom-0 w-px bg-rule/60" style={{ left: `${pct(h)}%` }} />
              ))}
              {shoots.filter((s) => s.location === loc).map((s) => {
                const t = tapeFor(s.production);
                const left = pct(toHours(s.starts_at));
                const width = pct(toHours(s.ends_at)) - left;
                return (
                  <div
                    key={s.schedule_id}
                    title={`${s.production}, scene ${s.scene_number}: ${s.starts_at} to ${s.ends_at} (${s.status.toLowerCase().replace("_", " ")})`}
                    className="absolute top-2 bottom-2 overflow-hidden rounded-[3px] px-2 text-xs font-semibold leading-8 whitespace-nowrap"
                    style={{ left: `${left}%`, width: `${width}%`, background: t.bg, color: t.fg }}
                  >
                    {s.production}, sc. {s.scene_number}
                  </div>
                );
              })}
              {now !== null && now >= first && now <= last && (
                <span className="absolute top-0 bottom-0 w-0.5 bg-alert" style={{ left: `${pct(now)}%` }} aria-hidden="true" />
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
