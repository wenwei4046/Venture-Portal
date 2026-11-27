/**
 * The owner, 2026-11-17: "ads performance 的 per lead 也一起改" — Ads Performance's Per lead, as Overview's since #1094:
 * (ads spend + the marketing fee's share) ÷ every lead of the period (total leads), not the ads' leads alone. An ad's own
 * row keeps its own leads.
 */
import { describe, expect, it } from "vitest";
import type { CrmData } from "@/lib/member/crm-data";
import type { DeskCtx, DeskUi } from "./ctx";
import { initialDeskUi } from "./ctx";
import { adsPerfVM, marketingFee } from "./adsperf";

const AD = "120210000000001";
const cust = (id: string, o: Record<string, unknown>) => ({ id, name: "Amy", phone: "60123456789", channel: "whatsapp", accountId: "x", adId: AD, ad: "Skyline", status: "new", assignedTo: null, teamId: null,
  createdAt: new Date(2026, 10, 3, 10).toISOString(), lastCustomerAt: null, unread: 0, details: { type: "", size: "", loc: "", req: "", budget: "" }, messages: [], ...o });
// One ad lead, then the same person writing again with no ad (a repeat: no lead of an ad's, but a lead of the period).
const data = {
  uiPrefs: { mktFee: 2_500 }, // a viewer who set RM 2,500 (the default is RM 0 since 2026-11-27)
  customers: [cust("a", {}), cust("b", { adId: null, ad: "", name: "Ben", phone: "60199999999", createdAt: new Date(2026, 10, 5, 10).toISOString() })],
  adNames: { [AD]: { name: "Skyline", added: true, pageId: "p" } },
  visits: [], events: [], adRules: [], can: { viewAll: true, manage: true, editAll: true },
} as unknown as CrmData;
const fig = { spend: 1000, impr: 0, reach: 0, clicks: 0, allClicks: 0, msgconv: 0 };

function run(over: Partial<DeskUi> = {}) {
  const ui: DeskUi = { ...initialDeskUi(), stage: "op", tab: "insight", insTab: "ads", insPer: "custom", insRange: { a: new Date(2026, 10, 1).getTime(), b: new Date(2026, 10, 11).getTime() },
    apStF: "all", apMeta: { "2026-11-01|2026-11-11": { [AD]: fig } }, ...over };
  return adsPerfVM({ ui, data, now: new Date(2026, 10, 11, 12), nameOf: (x: string) => x, act: {}, deskAct: {}, set: () => {}, patch: () => {} } as unknown as DeskCtx);
}

describe("Ads Performance's Per lead is ÷ total leads", () => {
  it("the strip's Per lead and its hover divide (spend + fee) by every lead of the period", () => {
    const fee = marketingFee(1000)!, cost = 1000 + fee;
    const cpl = run().apStrip.items.find((x: { key: string }) => x.key === "cpl")!;
    const r2 = (v: number) => `RM ${v.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    expect(cpl.total).toBe(r2(cost / 2)); // 2 leads in the period, though only 1 is the ad's
    expect(cpl.title).toBe(["Per lead = (Spent + marketing fee) ÷ Total leads", `(${r2(1000)} + ${r2(fee)}) ÷ 2 = ${r2(cost / 2)}`].join("\n"));
    expect(cpl.sub![0]).toBe(`Spent ÷ total leads: ${r2(500)}`);
  });
});
