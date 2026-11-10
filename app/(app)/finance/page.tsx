"use client";
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { inr, inrShort } from "@/lib/format";
import InvoicePanel from "./InvoicePanel";
import RevenueChart from "./RevenueChart";
import { api, BudgetBar, errText, FOCUS, INPUT, Notice, Pill, Summary, TAPE } from "./shared";

export default function FinancePage() {
  const [data, setData] = useState<Summary | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState<Notice | null>(null);
  const [query, setQuery] = useState("");
  const [overOnly, setOverOnly] = useState(false);
  const [openId, setOpenId] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await api<Summary>("/api/finance/summary"));
      setError("");
    } catch (e) {
      setError(errText(e));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const rows = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    return data.productions.filter(
      (p) => (!overOnly || p.over_budget) && (q === "" || p.title.toLowerCase().includes(q))
    );
  }, [data, query, overOnly]);

  const t = data?.totals;
  const kpis = t
    ? [
        { label: "Budgeted", value: t.budget, color: TAPE.blue, note: `${data!.productions.length} productions` },
        { label: "Committed cost", value: t.total_cost, color: TAPE.orange, note: t.budget > 0 ? `${((t.total_cost / t.budget) * 100).toFixed(0)}% of budget` : "" },
        { label: "Invoiced", value: t.invoiced, color: TAPE.yellow, note: "Excludes drafts" },
        { label: "Collected", value: t.paid, color: TAPE.green, note: t.invoiced > 0 ? `${((t.paid / t.invoiced) * 100).toFixed(0)}% of invoiced` : "" },
        { label: "Outstanding", value: t.outstanding, color: TAPE.magenta, note: "Invoiced, not yet paid" },
        { label: "Ready to invoice", value: t.unbilled, color: TAPE.ink, note: "Booked, not yet billed" },
      ]
    : [];

  return (
    <div className="max-w-6xl">
      <h1 className="font-display text-4xl font-bold tracking-tight">Finance</h1>
      <p className="mt-1 text-muted">
        {data?.scope === "own" ? "Productions you manage" : "Every production in the film city"}
      </p>

      {error && <p role="alert" className="mt-8 text-alert">{error}</p>}
      {!data && !error && <p className="mt-8 text-muted">Loading the ledger</p>}

      <div aria-live="polite" className="mt-6 empty:hidden">
        {notice && (
          <p
            role={notice.kind === "err" ? "alert" : "status"}
            className="border-l-4 bg-white/60 py-2.5 pl-4 pr-4"
            style={{ borderColor: notice.kind === "err" ? TAPE.red : TAPE.green }}
          >
            {notice.text}
          </p>
        )}
      </div>

      {data && t && (
        <>
          <dl className="mt-8 grid grid-cols-2 gap-x-8 gap-y-8 md:grid-cols-3 lg:grid-cols-6">
            {kpis.map((k) => (
              <div key={k.label} className="border-t-[5px] pt-3" style={{ borderColor: k.color }}>
                <dt className="text-sm text-muted">{k.label}</dt>
                <dd className="mt-1 font-display text-2xl font-semibold tabular-nums" title={inr(k.value)}>
                  {inrShort(k.value)}
                </dd>
                <dd className="mt-0.5 min-h-5 text-xs text-muted">{k.note}</dd>
              </div>
            ))}
          </dl>

          <section className="mt-14" aria-labelledby="rev-h">
            <h2 id="rev-h" className="mb-5 font-display text-xl font-semibold">Invoiced and collected by month</h2>
            <RevenueChart data={data.monthly} />
          </section>

          <section className="mt-14" aria-labelledby="prod-h">
            <h2 id="prod-h" className="font-display text-xl font-semibold">Productions</h2>

            {t.over_budget_count > 0 && (
              <p className="mt-3 border-l-4 bg-white/60 py-2.5 pl-4 pr-4" style={{ borderColor: TAPE.red }}>
                <span className="font-semibold">
                  {t.over_budget_count} {t.over_budget_count === 1 ? "production is" : "productions are"} over budget.
                </span>{" "}
                The alert is logged but bookings are never blocked.{" "}
                <button
                  type="button"
                  onClick={() => setOverOnly((v) => !v)}
                  className={`underline underline-offset-4 ${FOCUS}`}
                >
                  {overOnly ? "Show all productions" : "Show only these"}
                </button>
              </p>
            )}

            <div className="mt-5 flex flex-wrap items-center gap-4">
              <label className="sr-only" htmlFor="prod-search">Search productions</label>
              <input
                id="prod-search" type="search" value={query} onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by title" className={`${INPUT} w-64`}
              />
              <label className="inline-flex items-center gap-2 text-sm">
                <input type="checkbox" checked={overOnly} onChange={(e) => setOverOnly(e.target.checked)} />
                Over budget only
              </label>
              <span className="text-sm text-muted">Showing {rows.length} of {data.productions.length}</span>
            </div>

            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[60rem] text-left text-sm">
                <thead className="text-muted">
                  <tr className="[&>th]:pb-2 [&>th]:font-normal">
                    <th>Production</th>
                    <th>Status</th>
                    <th className="text-right">Budget</th>
                    <th className="pl-6">Spend against budget</th>
                    <th className="text-right">Invoiced</th>
                    <th className="text-right">Collected</th>
                    <th className="text-right">Outstanding</th>
                    <th className="text-right">Ready to invoice</th>
                    <th><span className="sr-only">Invoices</span></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((p) => {
                    const open = openId === p.production_id;
                    return (
                      <Fragment key={p.production_id}>
                        <tr className="border-t border-rule align-top [&>td]:py-3">
                          <td className="pr-4">
                            <div className="font-medium">{p.title}</div>
                            {data.scope === "all" && p.manager && <div className="text-xs text-muted">{p.manager}</div>}
                          </td>
                          <td><Pill status={p.status} /></td>
                          <td className="text-right tabular-nums">{inrShort(p.budget)}</td>
                          <td className="pl-6">
                            <BudgetBar pct={p.pct_used} over={p.over_budget} />
                            <div className="mt-1 text-xs tabular-nums text-muted" title={inr(p.total_cost)}>
                              {inrShort(p.total_cost)} committed
                              {p.over_budget && p.alert_since ? `, flagged ${p.alert_since}` : ""}
                            </div>
                          </td>
                          <td className="text-right tabular-nums">{inrShort(p.invoiced)}</td>
                          <td className="text-right tabular-nums">{inrShort(p.paid)}</td>
                          <td className={`text-right tabular-nums ${p.outstanding > 0 ? "font-semibold" : "text-muted"}`}>
                            {inrShort(p.outstanding)}
                          </td>
                          <td className="text-right tabular-nums">{inrShort(p.unbilled)}</td>
                          <td className="pl-4 text-right">
                            <button
                              type="button"
                              aria-expanded={open}
                              aria-controls={`inv-${p.production_id}`}
                              onClick={() => { setNotice(null); setOpenId(open ? null : p.production_id); }}
                              className={`rounded-sm border border-[#1B2A49]/40 px-3 py-1.5 transition-colors hover:bg-black/5 ${FOCUS}`}
                            >
                              {open ? "Hide invoices" : "Invoices"}
                            </button>
                          </td>
                        </tr>
                        {open && (
                          <tr id={`inv-${p.production_id}`}>
                            <td colSpan={9} className="p-0">
                              <InvoicePanel production={p} onChanged={load} notify={setNotice} />
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
              {rows.length === 0 && (
                <p className="border-t border-rule py-6 text-muted">
                  No productions match. Clear the search or turn off the over-budget filter.
                </p>
              )}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
