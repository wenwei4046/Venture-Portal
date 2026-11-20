/**
 * Profile › Closed deals (the owner, 2026-11-20: "在 crm profile 里面设计一个是可以让业务看到自己过往的成交记录"): every
 * customer marked Won whose deal is this person's — whoever held the customer when it was won (the journey's status event
 * names them as `owner`), else whoever holds it now — with the amount, the day, the visit it was won at and its quotation
 * and bank slip (mig 20261119230000). Read from what the CRM already reads; nothing new is asked of the database.
 */
import type { CrmData, CrmVisit } from "@/lib/member/crm-data";

export interface ClosedDeal {
  customerId: string;
  name: string;
  amount: number | null;
  /** When it was won: the journey's status event to won, else the Won visit's start. */
  at: string;
  visit: CrmVisit | null;
}

export type DealPeriod = "month" | "3m" | "year" | "all";
export const DEAL_PERIODS: [DealPeriod, string][] = [["month", "This month"], ["3m", "3 months"], ["year", "This year"], ["all", "All"]];

export function closedDeals(data: Pick<CrmData, "customers" | "visits" | "events">, ownerId: string): ClosedDeal[] {
  const out: ClosedDeal[] = [];
  for (const c of data.customers) {
    if (c.status !== "won") continue;
    const ev = data.events
      .filter(e => e.customerId === c.id && (e.kind === "won" || (e.kind === "status" && e.data?.to === "won")))
      .sort((a, b) => b.at.localeCompare(a.at))[0];
    if ((ev?.owner ?? c.assignedTo) !== ownerId) continue;
    const visit = data.visits.filter(v => v.customerId === c.id && v.outcome === "won").sort((a, b) => b.start.localeCompare(a.start))[0] ?? null;
    const at = ev?.at ?? visit?.start;
    if (!at) continue;
    out.push({ customerId: c.id, name: c.name, amount: c.wonAmount, at, visit });
  }
  return out.sort((a, b) => b.at.localeCompare(a.at));
}

/** The deals inside a period ending now: this calendar month, the last three months with this one, this year, or all. */
export function dealsIn(deals: ClosedDeal[], period: DealPeriod, now: Date): ClosedDeal[] {
  if (period === "all") return deals;
  const y = now.getFullYear(), m = now.getMonth();
  const from = period === "month" ? new Date(y, m, 1) : period === "3m" ? new Date(y, m - 2, 1) : new Date(y, 0, 1);
  return deals.filter(d => new Date(d.at).getTime() >= from.getTime());
}

/** Month by month, newest first: "November 2026", its deals and their total. */
export function dealsByMonth(deals: ClosedDeal[]): { key: string; label: string; deals: ClosedDeal[]; total: number }[] {
  const groups = new Map<string, ClosedDeal[]>();
  for (const d of deals) {
    const t = new Date(d.at), key = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}`;
    groups.set(key, [...(groups.get(key) ?? []), d]);
  }
  return [...groups.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([key, ds]) => ({
    key, label: new Date(`${key}-01T00:00:00`).toLocaleDateString("en-GB", { month: "long", year: "numeric" }),
    deals: ds, total: ds.reduce((s, d) => s + (d.amount ?? 0), 0),
  }));
}
