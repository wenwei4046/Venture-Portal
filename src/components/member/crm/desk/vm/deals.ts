/**
 * Closed deals on the desktop (the owner, 2026-11-20: "电脑版也做 closed deals"): the phone Profile's page as a sidebar
 * page under REPORTS — every deal this screen reads (the Team side's `allClosedDeals`, so View at All sees everybody's and a
 * leader their line's), the period, a seller to narrow it to, and a click into the chat. One view model with the phone
 * (`dealsView`, sales/vm/deals.ts); drawn by DeskDeals.tsx.
 *
 * 2026-11-23 (the owner: "排版整齐，加可 custom 时间线（像 insight 一样），增加第一次 contact 的时间 … unit size, 广告来源"):
 * Insight's periods — Today · This week · This month · This year · All · Custom with its calendar — and each deal's first
 * contact, how long it took, unit size and ad.
 */
import type { DeskCtx } from "./ctx";
import { allClosedDeals, dealsIn, dealsView, type DealPeriod } from "../../sales/vm/deals";
import type { DealsVM } from "../../shared/closed-deals";
import { alertsUnreadN } from "./inbox";
import { rangeLine } from "./frame4a";

export const DESK_DEAL_PERIODS: [DealPeriod, string][] = [["today", "Today"], ["week", "This week"], ["month", "This month"], ["year", "This year"], ["all", "All"], ["custom", "Custom"]];

export type DeskDealsVM = DealsVM & {
  alertsN: string; openAlerts: () => void; rangeText: string;
  picker: { value: { a: number; b: number }; allFrom: number; apply: (r: { a: number; b: number }) => void; cancel: () => void } | null;
};

export function deskDealsVM(ctx: DeskCtx): DeskDealsVM | null {
  const { ui, data, patch } = ctx;
  if (ui.tab !== "deals") return null;
  const deals = allClosedDeals(data);
  const per: DealPeriod = ui.dlPer && DESK_DEAL_PERIODS.some(p => p[0] === ui.dlPer) ? ui.dlPer : "all";
  const range = per === "custom" ? ui.dlRange ?? null : null;
  const v = dealsView({
    deals, per, now: ctx.now, periods: DESK_DEAL_PERIODS, range,
    setPer: k => patch(k === "custom" ? { dlDates: true } : { dlPer: k, dlDates: false }),
    roomName: id => data.rooms.find(r => r.id === id)?.name ?? "", back: () => patch({ tab: "insight" }),
    fileUrl: path => ctx.act.keyPhotoUrl(path),
    openChat: id => (data.customers.some(c => c.id === id) ? () => patch({ tab: "inbox", pane: "docked", kind: "chat", chat: id }) : null),
    nameOf: ctx.nameOf, who: ui.dlWho ?? null, setWho: id => patch({ dlWho: id }),
  });
  // Custom stays lit while its calendar is open.
  if (ui.dlDates) v.periods.forEach((p, i) => { p.on = DESK_DEAL_PERIODS[i][0] === "custom"; });
  const n = alertsUnreadN(ctx), now = ctx.now.getTime();
  // The days on screen, as Insight writes them ("1–23 Nov"); All reads from the first deal.
  const shown = dealsIn(deals, per, ctx.now, range);
  const first = deals.reduce((m, d) => Math.min(m, new Date(d.at).getTime()), now);
  const startOf = (k: DealPeriod) => { const t = ctx.now, y = t.getFullYear(), m = t.getMonth(), d = t.getDate();
    return k === "today" ? new Date(y, m, d).getTime() : k === "week" ? new Date(y, m, d - ((t.getDay() + 6) % 7)).getTime() : k === "month" ? new Date(y, m, 1).getTime() : k === "year" ? new Date(y, 0, 1).getTime() : first; };
  const rangeText = range ? rangeLine(range) : per === "all" && !shown.length ? "" : rangeLine({ a: startOf(per), b: now });
  return {
    ...v, rangeText, alertsN: n ? String(n) : "", openAlerts: () => patch({ pane: "overlay", kind: "alerts" }),
    picker: ui.dlDates ? { value: range ?? { a: startOf(per === "custom" ? "month" : per), b: now }, allFrom: first,
      apply: r => patch({ dlPer: "custom", dlRange: r, dlDates: false }), cancel: () => patch({ dlDates: false }) } : null,
  };
}
