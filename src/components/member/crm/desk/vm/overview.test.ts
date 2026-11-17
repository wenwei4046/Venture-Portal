/**
 * Insight › Overview on the desktop (the owner, 2026-11-17: "我想在 insight 加 Overview，主要是整合 ads performance + team
 * performance"): Insight's first tab and where it opens, the brand picked at the top, Meta's spend through apMeta.
 */
import { describe, expect, it } from "vitest";
import type { CrmData } from "@/lib/member/crm-data";
import { BRAND_WHATSAPP } from "@/lib/member/crm-source";
import type { DeskCtx, DeskUi } from "./ctx";
import { initialDeskUi } from "./ctx";
import { deskOverviewVM } from "./overview";
import { insightVM } from "./insight";
import { metaKey } from "../../shared/insight-overview";

const AD = "120210000000001", AD2 = "120210000000002";
const c = (id: string, o: Record<string, unknown>) => ({ id, name: id, phone: id, channel: "whatsapp", accountId: BRAND_WHATSAPP.conts, adId: AD, ad: "Skyline", status: "new", assignedTo: "p1", teamId: null,
  createdAt: new Date(2026, 10, 3, 10).toISOString(), lastCustomerAt: null, unread: 0, details: { type: "", size: "", loc: "", req: "", budget: "" }, messages: [], ...o });
const data = {
  customers: [c("a", {}), c("b", { assignedTo: "p2" }), c("d", { accountId: BRAND_WHATSAPP.dc, adId: AD2, ad: "Dream Reel", assignedTo: "p2" })],
  adNames: {}, visits: [], events: [], adRules: [], people: [], can: { viewAll: true, manage: true, editAll: true },
} as unknown as CrmData;
const teams = [{ id: "t1", name: "Team Ann", people: [{ id: "p1", name: "ANN" }, { id: "p2", name: "BEN" }] }];

function vm(over: Partial<DeskUi> = {}) {
  let ui: DeskUi = { ...initialDeskUi(), stage: "op", tab: "insight", insPer: "month", ...over };
  const patch = (p: Partial<DeskUi>) => { ui = { ...ui, ...p }; };
  const ctx = () => ({ ui, data, now: new Date(2026, 10, 17, 12), nameOf: (x: string) => x, act: {}, deskAct: {}, set: () => {}, patch, teams, directors: [], me: { id: "boss", name: "Boss" } } as unknown as DeskCtx);
  return { run: () => deskOverviewVM(ctx()), ins: () => insightVM(ctx()), ui: () => ui };
}

describe("Insight › Overview on the desktop", () => {
  it("is Insight's first tab and where Insight opens", () => {
    const s = vm();
    expect(s.ui().insTab).toBe("overview");
    const tabs = s.ins().insTabs;
    expect(tabs[0]).toMatchObject({ label: "Overview", on: true });
    expect(tabs.map(t => t.label).slice(0, 3)).toEqual(["Overview", "Team performance", "Ads performance"]);
    expect(s.ins().kInsight).toBe(false); // Team performance's body stays away while Overview shows
  });
  it("follows the brand picked at the top", () => {
    expect(vm().run().tiles.find(t => t.label === "Leads")!.value).toBe("3");
    const dc = vm({ insSrc: "dc" }).run();
    expect(dc.tiles.find(t => t.label === "Leads")!.value).toBe("1");
    expect(dc.ads.map(a => a.name)).toEqual(["Dream Reel"]);
  });
  it("asks Meta for its spend, then shows it from Ads Performance's cache", () => {
    const first = vm().run();
    expect(first.ready).toBe(false);
    expect(first.need.map(n => n.key)).toContain("2026-11-01|2026-11-30");
    const k = metaKey(new Date(2026, 10, 1).getTime(), new Date(2026, 10, 30).getTime());
    const fig = (spend: number) => ({ spend, impr: 0, reach: 0, clicks: 0, allClicks: 0, msgconv: 0 });
    const read = vm({ apMeta: { [k]: { [AD]: fig(800), [AD2]: fig(200) } } }).run();
    expect(read.tiles.find(t => t.label === "Ads spend")!.value).toBe("RM 1,000");
  });
  it("opens a team to its people and an ad to the teams its leads went to", () => {
    const s = vm();
    s.run().teams.find(t => t.name === "Team Ann")!.pick();
    expect(s.ui().insOvTeam).toBe("t1");
    expect(s.run().teams.filter(t => t.person).map(t => [t.name, t.leads])).toEqual([["BEN", "2"], ["ANN", "1"]]);
    s.run().ads.find(a => a.name === "Skyline")!.toggle();
    expect(s.run().ads.find(a => a.name === "Skyline")!.teams).toEqual([{ name: "Team Ann", dot: expect.any(String), leads: "2", share: "100%", appt: "0", won: "0", extra: "RM 0" }]);
  });
  it("hides the money for whoever may not read the ads' figures", () => {
    const s = vm();
    const noMoney = deskOverviewVM({ ...({ ui: s.ui(), data: { ...data, can: { viewAll: false, manage: false } }, now: new Date(2026, 10, 17), patch: () => {}, teams, directors: [] }) } as unknown as DeskCtx);
    expect(noMoney.money).toBe(false);
    expect(noMoney.tiles.map(t => t.label)).not.toContain("Ads spend");
    expect(noMoney.need).toEqual([]);
  });
});
