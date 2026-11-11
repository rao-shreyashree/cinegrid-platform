import { inr, inrShort, monthLabel } from "@/lib/format";
import { MonthPoint, TAPE } from "./shared";

function niceMax(v: number): number {
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}

export default function RevenueChart({ data }: { data: MonthPoint[] }) {
  const pts = data.slice(-12);
  if (pts.length === 0) {
    return <p className="text-muted">No invoices have been issued yet, so there is nothing to chart.</p>;
  }
  const top = niceMax(Math.max(...pts.flatMap((p) => [p.invoiced, p.collected]), 1));

  return (
    <figure>
      <div className="mb-4 flex flex-wrap gap-x-6 gap-y-1 text-sm">
        <span className="inline-flex items-center gap-2">
          <span aria-hidden className="h-2.5 w-2.5 rounded-[2px]" style={{ background: TAPE.blue }} />
          Invoiced
        </span>
        <span className="inline-flex items-center gap-2">
          <span aria-hidden className="h-2.5 w-2.5 rounded-[2px]" style={{ background: TAPE.green }} />
          Collected
        </span>
      </div>

      <div aria-hidden className="relative ml-16 h-52">
        {[0, 0.5, 1].map((f) => (
          <div key={f} className="absolute inset-x-0 border-t border-rule" style={{ bottom: `${f * 100}%` }}>
            <span className="absolute -left-16 w-14 -translate-y-1/2 text-right text-xs tabular-nums text-muted">
              {inrShort(top * f)}
            </span>
          </div>
        ))}
        <div className="absolute inset-0 flex items-end gap-3 px-2">
          {pts.map((p) => (
            <div
              key={p.month}
              className="flex h-full flex-1 items-end justify-center gap-1"
              title={`${monthLabel(p.month)}: invoiced ${inr(p.invoiced)}, collected ${inr(p.collected)}`}
            >
              <div className="w-full max-w-6" style={{ height: `${(p.invoiced / top) * 100}%`, background: TAPE.blue }} />
              <div className="w-full max-w-6" style={{ height: `${(p.collected / top) * 100}%`, background: TAPE.green }} />
            </div>
          ))}
        </div>
      </div>
      <div aria-hidden className="ml-16 mt-2 flex gap-3 px-2">
        {pts.map((p) => (
          <div key={p.month} className="flex-1 text-center text-xs text-muted">
            {monthLabel(p.month)}
          </div>
        ))}
      </div>

      <table className="sr-only">
        <caption>Invoiced and collected by month</caption>
        <thead>
          <tr><th>Month</th><th>Invoiced</th><th>Collected</th></tr>
        </thead>
        <tbody>
          {pts.map((p) => (
            <tr key={p.month}><td>{monthLabel(p.month)}</td><td>{inr(p.invoiced)}</td><td>{inr(p.collected)}</td></tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
