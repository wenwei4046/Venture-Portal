/**
 * Assignment › Leads by ad (2026-10-22, the owner: "我想要有一个独立的功能，可以看到每个广告谁拿到多少个名单"): every ad, and
 * under it each person who got its leads with how many — this month or all time — and the leads nobody holds yet.
 * Counted from the customers the CRM reads (each lead's ad and its present owner); the busiest ad and person first.
 */
import type { CrmCustomer } from "@/lib/member/crm-data";

export type LbaPeriod = "month" | "all";
export interface LbaRow { name: string; team: string; n: number; pct: number }
export interface LbaAd { id: string; name: string; total: number; rows: LbaRow[] }

export function leadsByAd(
  customers: CrmCustomer[], adIds: string[], nameOfAd: (id: string) => string,
  nameOf: (id: string) => string, teamOf: (id: string) => string | null, period: LbaPeriod, now: Date,
): LbaAd[] {
  const from = period === "month" ? new Date(now.getFullYear(), now.getMonth(), 1).getTime() : -Infinity;
  const inPeriod = (c: CrmCustomer) => new Date(c.createdAt).getTime() >= from;
  const ads = adIds.map(id => {
    const cs = customers.filter(c => c.adId === id && inPeriod(c));
    const by = new Map<string, number>();
    cs.forEach(c => by.set(c.assignedTo ?? "", (by.get(c.assignedTo ?? "") ?? 0) + 1));
    const rows = [...by].map(([who, n]) => ({ name: who ? nameOf(who) : "Not assigned yet", team: who ? teamOf(who) ?? "" : "", n, pct: cs.length ? n / cs.length : 0 }))
      .sort((a, b) => Number(a.name === "Not assigned yet") - Number(b.name === "Not assigned yet") || b.n - a.n || a.name.localeCompare(b.name));
    return { id, name: nameOfAd(id), total: cs.length, rows };
  });
  return ads.sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
}
