/**
 * Closed deals on the desktop (the owner, 2026-11-20: "电脑版也做 closed deals"): the phone Profile's page as a sidebar
 * page under REPORTS — every deal this screen reads (the Team side's `allClosedDeals`, so View at All sees everybody's and a
 * leader their line's), the period, a seller to narrow it to, and a click into the chat. One view model with the phone
 * (`dealsView`, sales/vm/deals.ts); drawn by DeskDeals.tsx.
 */
import type { DeskCtx } from "./ctx";
import { allClosedDeals, dealsView } from "../../sales/vm/deals";
import type { DealsVM } from "../../shared/closed-deals";
import { alertsUnreadN } from "./inbox";

export function deskDealsVM(ctx: DeskCtx): (DealsVM & { alertsN: string; openAlerts: () => void }) | null {
  const { ui, data, patch } = ctx;
  if (ui.tab !== "deals") return null;
  const v = dealsView({
    deals: allClosedDeals(data), per: ui.dlPer ?? "all", setPer: k => patch({ dlPer: k }), now: ctx.now,
    roomName: id => data.rooms.find(r => r.id === id)?.name ?? "", back: () => patch({ tab: "insight" }),
    fileUrl: path => ctx.act.keyPhotoUrl(path),
    openChat: id => (data.customers.some(c => c.id === id) ? () => patch({ tab: "inbox", pane: "docked", kind: "chat", chat: id }) : null),
    nameOf: ctx.nameOf, who: ui.dlWho ?? null, setWho: id => patch({ dlWho: id }),
  });
  const n = alertsUnreadN(ctx);
  return { ...v, alertsN: n ? String(n) : "", openAlerts: () => patch({ pane: "overlay", kind: "alerts" }) };
}
