// Shared types, colours and small components for the finance pages.

export const TAPE = {
  yellow: "#F0C419",
  magenta: "#C2307A",
  green: "#2E9E5B",
  blue: "#2F6FDE",
  orange: "#E8791D",
  red: "#C8372D",
  ink: "#1B2A49",
  grey: "#8A8F98",
} as const;

export const FOCUS =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2F6FDE]";
export const BTN_PRIMARY = `inline-flex items-center justify-center rounded-sm bg-[#F0C419] px-4 py-2 font-semibold text-[#1B2A49] transition-colors hover:bg-[#DDB211] disabled:cursor-not-allowed disabled:opacity-40 ${FOCUS}`;
export const BTN_QUIET = `inline-flex items-center justify-center rounded-sm border border-[#1B2A49]/40 px-3 py-1.5 text-sm text-[#1B2A49] transition-colors hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-40 ${FOCUS}`;
export const INPUT = `rounded-sm border border-[#1B2A49]/30 bg-white/70 px-2.5 py-1.5 text-sm text-[#1B2A49] ${FOCUS}`;

export type ProdRow = {
  production_id: number;
  title: string;
  status: string;
  manager: string | null;
  budget: number;
  total_cost: number;
  invoiced: number;
  paid: number;
  outstanding: number;
  pct_used: number | null;
  over_budget: boolean;
  alert_since: string | null;
  unbilled: number;
};

export type MonthPoint = { month: string; invoiced: number; collected: number };

export type Summary = {
  scope: "all" | "own";
  totals: {
    budget: number;
    total_cost: number;
    invoiced: number;
    paid: number;
    outstanding: number;
    unbilled: number;
    over_budget_count: number;
  };
  monthly: MonthPoint[];
  productions: ProdRow[];
};

export type InvoiceItem = { item_type: string; description: string; charge: number };
export type Invoice = {
  invoice_id: number;
  status: string;
  issue_date: string;
  total: number;
  paid: number;
  items: InvoiceItem[];
};

export type Notice = { kind: "ok" | "err"; text: string };

export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(typeof body?.error === "string" ? body.error : `Request failed (${res.status})`);
  return body as T;
}

export function errText(e: unknown): string {
  return e instanceof Error ? e.message : "Something went wrong. Try again.";
}

const STATUS: Record<string, { label: string; color: string }> = {
  PLANNED: { label: "Planned", color: TAPE.yellow },
  PRE_PRODUCTION: { label: "Pre-production", color: TAPE.blue },
  SHOOTING: { label: "Shooting", color: TAPE.green },
  POST_PRODUCTION: { label: "Post-production", color: TAPE.orange },
  COMPLETED: { label: "Completed", color: TAPE.ink },
  CANCELLED: { label: "Cancelled", color: TAPE.red },
  DRAFT: { label: "Draft", color: TAPE.grey },
  ISSUED: { label: "Issued", color: TAPE.blue },
  PARTIALLY_PAID: { label: "Partly paid", color: TAPE.orange },
  PAID: { label: "Paid", color: TAPE.green },
  OVERDUE: { label: "Overdue", color: TAPE.red },
};

/** Status as a small tape-coloured square plus the word, so colour is never the only signal. */
export function Pill({ status }: { status: string }) {
  const s = STATUS[status] ?? { label: status, color: TAPE.grey };
  return (
    <span className="inline-flex items-center gap-2 whitespace-nowrap text-sm">
      <span aria-hidden className="h-2.5 w-2.5 rounded-[2px]" style={{ background: s.color }} />
      {s.label}
    </span>
  );
}

/** Spend as a share of budget. Past 100% the bar rescales and a vertical mark shows where the budget ended. */
export function BudgetBar({ pct, over }: { pct: number | null; over: boolean }) {
  if (pct === null) return <span className="text-sm text-muted">No budget set</span>;
  const scale = Math.max(pct, 100);
  const color = over ? TAPE.red : pct >= 80 ? TAPE.orange : TAPE.green;
  return (
    <div className="flex items-center gap-3">
      <div className="relative h-2.5 w-28 bg-black/10" role="img" aria-label={`${pct.toFixed(0)}% of budget used`}>
        <div className="absolute inset-y-0 left-0" style={{ width: `${(pct / scale) * 100}%`, background: color }} />
        {over && (
          <div className="absolute -inset-y-1 w-0.5 bg-[#1B2A49]" style={{ left: `${(100 / scale) * 100}%` }} />
        )}
      </div>
      <span className={`text-sm tabular-nums ${over ? "font-semibold text-alert" : ""}`}>{pct.toFixed(0)}%</span>
    </div>
  );
}
