"use client";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { inr, inrShort } from "@/lib/format";
import { api, BTN_PRIMARY, BTN_QUIET, errText, FOCUS, INPUT, Invoice, Notice, Pill, ProdRow } from "./shared";

const ITEM_LABEL: Record<string, string> = { LOCATION: "Location", EQUIPMENT: "Equipment", SERVICE: "Service" };

type Props = {
  production: ProdRow;
  onChanged: () => void;
  notify: (n: Notice | null) => void;
};

export default function InvoicePanel({ production, onChanged, notify }: Props) {
  const [invoices, setInvoices] = useState<Invoice[] | null>(null);
  const [busy, setBusy] = useState(false);
  const pid = production.production_id;

  const load = useCallback(async () => {
    try {
      const r = await api<{ invoices: Invoice[] }>(`/api/finance/invoices?production_id=${pid}`);
      setInvoices(r.invoices);
    } catch (e) {
      notify({ kind: "err", text: errText(e) });
      setInvoices([]);
    }
  }, [pid, notify]);

  useEffect(() => {
    load();
  }, [load]);

  async function generate() {
    setBusy(true);
    notify(null);
    try {
      const r = await api<{ invoice_id: number }>("/api/finance/invoices", {
        method: "POST",
        body: JSON.stringify({ production_id: pid }),
      });
      notify({ kind: "ok", text: `Invoice #${r.invoice_id} generated for ${production.title}.` });
      await load();
      onChanged();
    } catch (e) {
      notify({ kind: "err", text: errText(e) });
    } finally {
      setBusy(false);
    }
  }

  async function pay(e: FormEvent<HTMLFormElement>, inv: Invoice) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const amount = Number(fd.get("amount"));
    const method = String(fd.get("method"));
    setBusy(true);
    notify(null);
    try {
      await api("/api/finance/payments", {
        method: "POST",
        body: JSON.stringify({ invoice_id: inv.invoice_id, amount, method }),
      });
      notify({ kind: "ok", text: `Payment of ${inr(amount)} recorded on invoice #${inv.invoice_id}.` });
      await load();
      onChanged();
    } catch (err) {
      notify({ kind: "err", text: errText(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="border-t border-rule bg-white/50 px-5 py-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="max-w-xl">
          <h3 className="font-display text-lg font-semibold">Invoices for {production.title}</h3>
          <p className="mt-1 text-sm text-muted">
            Generating an invoice bills every location, equipment and service charge that is not on an invoice yet.
          </p>
        </div>
        <button type="button" className={BTN_PRIMARY} disabled={busy || production.unbilled <= 0} onClick={generate}>
          {production.unbilled > 0 ? `Generate invoice for ${inrShort(production.unbilled)}` : "Nothing to invoice"}
        </button>
      </div>

      {invoices === null && <p className="mt-6 text-muted">Loading invoices</p>}
      {invoices && invoices.length === 0 && (
        <p className="mt-6 text-muted">No invoices yet. Generate one once this production has bookings.</p>
      )}

      <ul className="mt-6 divide-y divide-rule">
        {invoices?.map((inv) => {
          const balance = Math.max(inv.total - inv.paid, 0);
          return (
            <li key={inv.invoice_id} className="py-5">
              <div className="flex flex-wrap items-baseline justify-between gap-x-8 gap-y-2">
                <div className="flex items-baseline gap-4">
                  <span className="font-display text-lg font-semibold">Invoice #{inv.invoice_id}</span>
                  <Pill status={inv.status} />
                  {inv.issue_date && <span className="text-sm text-muted">Issued {inv.issue_date}</span>}
                </div>
                <dl className="flex gap-8 text-sm tabular-nums">
                  <div><dt className="text-muted">Total</dt><dd className="font-semibold">{inr(inv.total)}</dd></div>
                  <div><dt className="text-muted">Paid</dt><dd className="font-semibold">{inr(inv.paid)}</dd></div>
                  <div><dt className="text-muted">Balance</dt><dd className="font-semibold">{inr(balance)}</dd></div>
                </dl>
              </div>

              <details className="mt-3 text-sm">
                <summary className={`w-fit cursor-pointer text-[#1B2A49] underline underline-offset-4 ${FOCUS}`}>
                  {inv.items.length > 0 ? `Show ${inv.items.length} line items` : "Line items"}
                </summary>
                {inv.items.length === 0 ? (
                  <p className="mt-2 text-muted">This invoice has no itemised lines. It was not created by the invoice generator.</p>
                ) : (
                  <ul className="mt-2 max-w-2xl">
                    {inv.items.map((it, i) => (
                      <li key={i} className="flex justify-between gap-6 border-t border-rule py-1.5">
                        <span><span className="text-muted">{ITEM_LABEL[it.item_type] ?? it.item_type}</span> &nbsp;{it.description}</span>
                        <span className="tabular-nums">{inr(it.charge)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </details>

              {inv.status === "DRAFT" && (
                <p className="mt-3 text-sm text-muted">Draft invoices cannot take payments. Issue the invoice first.</p>
              )}
              {inv.status !== "DRAFT" && inv.status !== "PAID" && (
                <form
                  key={`${inv.invoice_id}-${inv.paid}`}
                  onSubmit={(e) => pay(e, inv)}
                  className="mt-4 flex flex-wrap items-end gap-3"
                >
                  <label className="grid gap-1 text-sm">
                    Amount in rupees
                    <input
                      name="amount" type="number" min="0.01" step="0.01" required
                      defaultValue={balance.toFixed(2)} className={`${INPUT} w-40 tabular-nums`}
                    />
                  </label>
                  <label className="grid gap-1 text-sm">
                    Method
                    <select name="method" defaultValue="UPI" className={INPUT}>
                      <option value="UPI">UPI</option>
                      <option value="NEFT">NEFT</option>
                      <option value="CHEQUE">Cheque</option>
                      <option value="CARD">Card</option>
                    </select>
                  </label>
                  <button type="submit" className={BTN_QUIET} disabled={busy}>Record payment</button>
                </form>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
