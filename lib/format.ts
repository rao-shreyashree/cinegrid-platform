const inrFull = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

/** Full rupee amount: 1234567 -> ₹12,34,567 */
export function inr(n: number): string {
  return (n < 0 ? "-" : "") + "₹" + inrFull.format(Math.abs(Math.round(n)));
}

/** Compact Indian units: 12500000 -> ₹1.25 Cr, 340000 -> ₹3.40 L */
export function inrShort(n: number): string {
  const sign = n < 0 ? "-" : "";
  const a = Math.abs(n);
  if (a >= 1e7) return `${sign}₹${(a / 1e7).toFixed(2)} Cr`;
  if (a >= 1e5) return `${sign}₹${(a / 1e5).toFixed(2)} L`;
  return `${sign}₹${inrFull.format(Math.round(a))}`;
}

/** "2026-03" -> "Mar 26" */
export function monthLabel(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleString("en-IN", { month: "short" }) + " " + String(y).slice(2);
}
