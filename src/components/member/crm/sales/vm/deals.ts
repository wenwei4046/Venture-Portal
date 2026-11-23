/**
 * Profile › Closed deals (the owner, 2026-11-20: "在 crm profile 里面设计一个是可以让业务看到自己过往的成交记录"): every
 * customer marked Won whose deal is this person's — whoever held the customer when it was won (the journey's status event
 * names them as `owner`), else whoever holds it now — with the amount, the day, the visit it was won at and its quotation
 * and bank slip (mig 20261119230000). Read from what the CRM already reads; nothing new is asked of the database.
 */
import type { CrmData, CrmVisit } from "@/lib/member/crm-data";
import type { DealsVM } from "../../shared/closed-deals";
import { openViewer } from "../../shared/viewer";

export interface ClosedDeal {
  customerId: string;
  name: string;
  amount: number | null;
  /** When it was won: the journey's status event to won, else the Won visit's start. */
  at: string;
  visit: CrmVisit | null;
  /** The customer's first contact (their chat's start) — how long the deal took (the owner, 2026-11-23). */
  firstAt?: string;
  /** Unit size and where the lead came from, for the desktop's table (2026-11-23). */
  unit?: string; ad?: string;
}

export type DealPeriod = "today" | "week" | "month" | "3m" | "year" | "all" | "custom";
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
    out.push({ customerId: c.id, name: c.name, amount: c.wonAmount, at, visit, firstAt: c.createdAt, unit: c.details?.size || "", ad: c.ad || "" });
  }
  return out.sort((a, b) => b.at.localeCompare(a.at));
}

/** The deals inside a period ending now: this calendar month, the last three months with this one, this year, or all. */
export function dealsIn<D extends { at: string }>(deals: D[], period: DealPeriod, now: Date, range?: { a: number; b: number } | null): D[] {
  if (period === "all") return deals;
  // Custom (the desktop, 2026-11-23: "加可 custom 时间线（像 insight 一样）"): from the first day's start to the last day's end.
  if (period === "custom") {
    if (!range) return deals;
    const a = new Date(range.a), b = new Date(range.b), from = new Date(a.getFullYear(), a.getMonth(), a.getDate()).getTime(), to = new Date(b.getFullYear(), b.getMonth(), b.getDate() + 1).getTime();
    return deals.filter(d => { const t = new Date(d.at).getTime(); return t >= from && t < to; });
  }
  const y = now.getFullYear(), m = now.getMonth(), dd = now.getDate();
  const from = period === "today" ? new Date(y, m, dd) : period === "week" ? new Date(y, m, dd - ((now.getDay() + 6) % 7))
    : period === "month" ? new Date(y, m, 1) : period === "3m" ? new Date(y, m - 2, 1) : new Date(y, 0, 1);
  return deals.filter(d => new Date(d.at).getTime() >= from.getTime());
}
/** How long a deal took, first contact to won: "Same day", "1 day", "18 days". */
export function tookOf(firstAt: string | undefined, at: string): string {
  if (!firstAt) return "";
  const a = new Date(firstAt), b = new Date(at);
  const days = Math.round((new Date(b.getFullYear(), b.getMonth(), b.getDate()).getTime() - new Date(a.getFullYear(), a.getMonth(), a.getDate()).getTime()) / 86_400_000);
  return days <= 0 ? "Same day" : days === 1 ? "1 day" : `${days} days`;
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

/** Every Won customer the CRM reads, each credited to its seller (the Team side's Closed deals, 2026-11-20). */
export function allClosedDeals(data: Pick<CrmData, "customers" | "visits" | "events">): (ClosedDeal & { seller: string | null })[] {
  const sellers = new Set<string | null>();
  for (const c of data.customers) if (c.status === "won") {
    const ev = data.events.filter(e => e.customerId === c.id && (e.kind === "won" || (e.kind === "status" && e.data?.to === "won"))).sort((a, b) => b.at.localeCompare(a.at))[0];
    sellers.add(ev?.owner ?? c.assignedTo);
  }
  return [...sellers].flatMap(s => (s ? closedDeals(data, s).map(d => ({ ...d, seller: s })) : [])).sort((a, b) => b.at.localeCompare(a.at));
}

const IMAGE = /\.(jpe?g|png|webp|heic|gif)$/i, PDF = /\.pdf$/i;

/** The page's view model, for Mine (one's own) and the Team side (everybody's, a person to pick, each row says who). */
export function dealsView(o: {
  deals: (ClosedDeal & { seller?: string | null })[]; per: DealPeriod; setPer: (p: DealPeriod) => void; now: Date;
  roomName: (id: string) => string; fileUrl: (path: string) => Promise<string | null>;
  openChat: (customerId: string) => (() => void) | null; back: () => void; ownBack?: boolean;
  nameOf?: (id: string | null | undefined) => string; who?: string | null; setWho?: (id: string | null) => void;
  /** The desktop's own periods (Today … Custom) and Custom's days; the phone keeps DEAL_PERIODS. */
  periods?: [DealPeriod, string][]; range?: { a: number; b: number } | null;
}): DealsVM {
  const byWho = o.who ? o.deals.filter(d => d.seller === o.who) : o.deals;
  const shown = dealsIn(byWho, o.per, o.now, o.range);
  const sum = shown.reduce((t, d) => t + (d.amount ?? 0), 0), priced = shown.filter(d => d.amount != null).length;
  const fileOpen = (path: string, name: string) => () => {
    void o.fileUrl(path).then(url => { if (url) openViewer([{ kind: IMAGE.test(path) ? "image" : "file", url, name, ...(PDF.test(path) ? { mime: "application/pdf" } : {}) }], 0); });
  };
  const sellers = o.setWho && o.nameOf ? [...new Set(o.deals.map(d => d.seller).filter((s): s is string => !!s))] : [];
  return {
    back: o.back, ownBack: o.ownBack,
    periods: (o.periods ?? DEAL_PERIODS).map(([k, label]) => ({ label, on: o.per === k, pick: () => o.setPer(k) })),
    people: sellers.length && o.setWho && o.nameOf ? [{ label: "Everyone", on: !o.who, pick: () => o.setWho!(null) },
      ...sellers.map(s => ({ label: o.nameOf!(s), on: o.who === s, pick: () => o.setWho!(s) })).sort((a, b) => a.label.localeCompare(b.label))] : undefined,
    total: money(sum), count: String(shown.length), avg: priced ? money(Math.round(sum / priced)) : "—",
    empty: o.deals.length ? "No deals closed in this period." : "No closed deals yet. A visit marked Won, with its amount, quotation and bank slip, shows here.",
    months: dealsByMonth(shown).map(m => ({ key: m.key, label: m.label, total: money(m.total), n: m.deals.length, rows: m.deals.map(d => {
      const deal = d as ClosedDeal & { seller?: string | null };
      const by = o.nameOf && deal.seller ? o.nameOf(deal.seller) : "";
      const day = new Date(d.at).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
      return {
        day, by, first: d.firstAt ? new Date(d.firstAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "", took: tookOf(d.firstAt, d.at), unit: d.unit ?? "", ad: d.ad ?? "",
        key: d.customerId, name: d.name, ini: initials(d.name), amount: d.amount != null ? money(d.amount) : "—",
        when: "Won " + day + (by ? ` · ${by}` : ""),
        where: d.visit ? (d.visit.kind ? d.visit.label || d.visit.place || "" : o.roomName(d.visit.showroomId)) : "",
        files: d.visit?.wonFiles ? [{ label: "Quotation", file: d.visit.wonFiles.quote, open: fileOpen(d.visit.wonFiles.quote.path, d.visit.wonFiles.quote.name) },
          { label: "Bank slip", file: d.visit.wonFiles.slip, open: fileOpen(d.visit.wonFiles.slip.path, d.visit.wonFiles.slip.name) }] : [],
        open: o.openChat(d.customerId),
      };
    }) })),
  };
}
const money = (n: number) => "RM " + n.toLocaleString("en-MY", { maximumFractionDigits: 2 });
const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]!.toUpperCase()).join("") || "?";
