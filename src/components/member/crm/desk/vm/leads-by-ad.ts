/**
 * Assignment › Leads by ad (2026-10-22, the owner: "我想要有一个独立的功能，可以看到每个广告谁拿到多少个名单"): every ad, and
 * under it each person who got its leads with how many, and the leads nobody holds yet. Counted from the customers the CRM
 * reads (each lead's ad and its present owner).
 * v2 (frames 06b / 06b·2, note 04 / 06): periods This month · Last month · All time · Custom, the ad's status (All · Running ·
 * Paused · Ended), each ad's teams, a search over ads and members, sortable columns — one table, shared by Reports.
 */
import type { CrmCustomer } from "@/lib/member/crm-data";

export type LbaPeriod = "month" | "last" | "all" | "custom";
export type LbaStatus = "Running" | "Paused" | "Ended" | "Pending";
/** One lead in a person's list (2026-10-23, the owner: "点成员名单要可以看到他们得到的 list"), newest first. */
export interface LbaLead { id: string; name: string; at: string; phone: string }
export interface LbaRow { who: string; name: string; team: string; teamId: string | null; n: number; pct: number; leads: LbaLead[] }
export interface LbaAd { id: string; name: string; total: number; rows: LbaRow[]; teams: string[] }

/** The period's bounds [from, to) in ms; Custom takes the two days typed (to inclusive). */
export function lbaRange(period: LbaPeriod, now: Date, custom?: { from: string; to: string } | null): [number, number] {
  const y = now.getFullYear(), m = now.getMonth();
  if (period === "month") return [new Date(y, m, 1).getTime(), Infinity];
  if (period === "last") return [new Date(y, m - 1, 1).getTime(), new Date(y, m, 1).getTime()];
  if (period === "custom" && custom?.from && custom?.to) {
    const [a, b] = [custom.from, custom.to].sort();
    return [new Date(`${a}T00:00:00`).getTime(), new Date(`${b}T00:00:00`).getTime() + 86_400_000];
  }
  return [-Infinity, Infinity];
}

export function leadsByAd(
  customers: CrmCustomer[], adIds: string[], nameOfAd: (id: string) => string,
  nameOf: (id: string) => string, teamOf: (id: string) => { id: string; name: string } | null, range: [number, number],
): LbaAd[] {
  const [from, to] = range;
  const inPeriod = (c: CrmCustomer) => { const t = new Date(c.createdAt).getTime(); return t >= from && t < to; };
  const ads = adIds.map(id => {
    const cs = customers.filter(c => c.adId === id && inPeriod(c));
    const by = new Map<string, CrmCustomer[]>();
    cs.forEach(c => by.set(c.assignedTo ?? "", [...(by.get(c.assignedTo ?? "") ?? []), c]));
    const rows = [...by].map(([who, list]) => { const tm = who ? teamOf(who) : null;
      return { who, name: who ? nameOf(who) : "Not assigned yet", team: tm?.name ?? "", teamId: tm?.id ?? null, n: list.length, pct: cs.length ? list.length / cs.length : 0,
        leads: list.map(c => ({ id: c.id, name: c.name, at: c.createdAt, phone: c.phone ?? "" })).sort((a, b) => b.at.localeCompare(a.at)) }; })
      .sort((a, b) => Number(a.name === "Not assigned yet") - Number(b.name === "Not assigned yet") || b.n - a.n || a.name.localeCompare(b.name));
    const teams = [...new Set(rows.map(r => r.teamId).filter((x): x is string => !!x))];
    return { id, name: nameOfAd(id), total: cs.length, rows, teams };
  });
  return ads.sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
}

/** Ended = its end date passed or Meta archived / deleted it; else Ads Manager's own Running · Paused · Pending. */
export function lbaStatus(meta: { status?: string | null; endAt?: string | null } | undefined, running: "Running" | "Paused" | "Pending", now: Date): LbaStatus {
  const st = (meta?.status ?? "").toUpperCase(), end = meta?.endAt ? new Date(meta.endAt).getTime() : NaN;
  if ((Number.isFinite(end) && end < now.getTime()) || st === "ARCHIVED" || st === "DELETED" || st === "COMPLETED") return "Ended";
  return running;
}
