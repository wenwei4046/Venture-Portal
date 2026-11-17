/**
 * Insight's Custom › Compare with (the owner, 2026-11-17: "在 custom 做 compare 时间"): empty = the same number of days
 * just before; picked = every "vs …" on Insight (Overview, Team performance) compares with that range.
 */
import { describe, expect, it } from "vitest";
import type { CrmData } from "@/lib/member/crm-data";
import { BRAND_WHATSAPP } from "@/lib/member/crm-source";
import type { DeskCtx, DeskUi } from "./ctx";
import { initialDeskUi } from "./ctx";
import { compareRange, compareWords, insightCompareVM, insightVM, prevRange } from "./insight";
import { deskOverviewVM } from "./overview";
import { phoneOverviewProps } from "../../panel/vm/app";
import type { PanelCtx } from "../../panel/vm/ctx";

const D = (m: number, d: number) => new Date(2026, m, d).getTime();
const c = (id: string, at: number) => ({ id, name: id, phone: id, channel: "whatsapp", accountId: BRAND_WHATSAPP.conts, adId: null, ad: "", status: "new", assignedTo: "p1", teamId: null,
  createdAt: new Date(at + 10 * 3600_000).toISOString(), lastCustomerAt: null, unread: 0, details: { type: "", size: "", loc: "", req: "", budget: "" }, messages: [] });
// Three leads 1–17 Nov, one on 20 Oct, two on 5–6 Oct.
const data = {
  customers: [c("a", D(10, 2)), c("b", D(10, 9)), c("d", D(10, 16)), c("e", D(9, 20)), c("f", D(9, 5)), c("g", D(9, 6))],
  adNames: {}, visits: [], events: [], adRules: [], people: [], can: { viewAll: true, manage: true, editAll: true },
} as unknown as CrmData;
const teams = [{ id: "t1", name: "Team Ann", people: [{ id: "p1", name: "ANN" }] }];
const NOV = { a: D(10, 1), b: D(10, 17) }, OCT_1_17 = { a: D(9, 1), b: D(9, 17) };

function desk(over: Partial<DeskUi> = {}) {
  let ui: DeskUi = { ...initialDeskUi(), stage: "op", tab: "insight", ...over };
  const patch = (p: Partial<DeskUi>) => { ui = { ...ui, ...p }; };
  const ctx = () => ({ ui, data, now: new Date(2026, 10, 17, 12), nameOf: (x: string) => x, act: {}, deskAct: {}, set: () => {}, patch, teams, directors: [], me: { id: "boss", name: "Boss" } } as unknown as DeskCtx);
  return { ctx, ui: () => ui };
}

describe("the range Insight compares with", () => {
  it("is the period before unless Custom has a range picked", () => {
    expect(compareRange({ insPer: "custom", insCmpRange: null }, NOV)).toEqual({ a: D(9, 15), b: D(9, 31) }); // 17 days just before
    expect(compareRange({ insPer: "custom", insCmpRange: OCT_1_17 }, NOV)).toEqual(OCT_1_17);
    // A range left over from Custom does nothing on another period.
    expect(compareRange({ insPer: "month", insCmpRange: OCT_1_17 }, { a: D(10, 1), b: D(10, 30) })).toEqual(prevRange({ a: D(10, 1), b: D(10, 30) }));
  });
  it("says what it compares with", () => {
    expect(compareWords({ insPer: "custom", insCmpRange: OCT_1_17 }, OCT_1_17)).toBe("vs 1–17 Oct");
    expect(compareWords({ insPer: "custom", insCmpRange: null }, prevRange(NOV))).toBe("vs before");
    expect(compareWords({ insPer: "month" }, { a: D(9, 1), b: D(9, 31) })).toBe("vs Oct");
    expect(compareWords({ insPer: "week" }, NOV)).toBe("vs last week");
    expect(compareWords({ insPer: "day" }, NOV)).toBe("vs yesterday");
  });
});

describe("Compare with in Insight's head", () => {
  it("shows on Custom only, not on Ads performance (it has its own)", () => {
    expect(insightCompareVM(desk({ insPer: "month" }).ctx())).toBeNull();
    expect(insightCompareVM(desk({ insPer: "custom", insRange: NOV, insTab: "ads" }).ctx())).toBeNull();
    expect(insightCompareVM(desk({ insPer: "custom", insRange: NOV, insTab: "overview" }).ctx())).toMatchObject({ on: false });
  });
  it("starts on the days just before, takes a picked range, and × goes back", () => {
    const s = desk({ insPer: "custom", insRange: NOV });
    insightCompareVM(s.ctx())!.toggle();
    expect(s.ui().insCmpRange).toEqual(prevRange(NOV));
    const open = insightCompareVM(s.ctx())!;
    expect(open.pick).not.toBeNull();
    open.pick!.apply(OCT_1_17);
    expect(s.ui().insCmpRange).toEqual(OCT_1_17);
    expect(insightCompareVM(s.ctx())).toMatchObject({ on: true, label: "vs 1–17 Oct", pick: null });
    insightCompareVM(s.ctx())!.toggle();
    expect(s.ui().insCmpRange).toBeNull();
  });
});

describe("every vs on Insight follows it", () => {
  it("Overview's tiles", () => {
    const before = deskOverviewVM(desk({ insPer: "custom", insRange: NOV }).ctx());
    expect(before.vs).toBe("vs before");
    expect(before.tiles.find(t => t.label === "Leads")!.d).toBe("+200%"); // 3 against the 1 lead of 15–31 Oct
    const picked = deskOverviewVM(desk({ insPer: "custom", insRange: NOV, insCmpRange: OCT_1_17 }).ctx());
    expect(picked.vs).toBe("vs 1–17 Oct");
    expect(picked.tiles.find(t => t.label === "Leads")!.d).toBe("+50%"); // 3 against the 2 of 1–17 Oct
  });
  it("Team performance's cells", () => {
    const v = insightVM(desk({ insPer: "custom", insRange: NOV, insCmpRange: OCT_1_17, insTab: "team" }).ctx());
    expect(v.metrics4.every(m => m.vsWords === "vs 1–17 Oct")).toBe(true);
    expect(insightVM(desk({ insPer: "custom", insRange: NOV, insTab: "team" }).ctx()).metrics4[0].vsWords).toBeUndefined(); // the design's "vs last"
  });
});

describe("Overview's tiles on hover (the owner, 2026-11-17: 鼠标指向这些数据会出现小字提示)", () => {
  it("say how each figure is worked out and what it is compared with, by its dates", () => {
    const tiles = deskOverviewVM(desk({ insPer: "custom", insRange: NOV, insCmpRange: OCT_1_17 }).ctx()).tiles;
    const tip = (l: string) => tiles.find(t => t.label === l)!.tip;
    expect(tip("Leads")).toEqual({ sub: ["Leads = new customers in the period", "Each customer counted once"], title: "vs 1–17 Oct: 2" });
    expect(tip("Appt rate").sub[0]).toBe("Appt rate = leads who booked ÷ leads");
    expect(tip("Appt rate").sub[1]).toBe("0 ÷ 3 = 0%");
    expect(tip("Show-up").sub).toEqual(["Show-up = customers who came ÷ visits due"]); // no visits due: no working line
    // The days just before name their dates too.
    expect(deskOverviewVM(desk({ insPer: "custom", insRange: NOV }).ctx()).tiles.find(t => t.label === "Leads")!.tip.title).toBe("vs 15–31 Oct: 1");
  });
  it("work the money out in the period's own numbers", async () => {
    const { overviewTiles } = await import("../../shared/insight-overview");
    const m = { spend: 1000, fee: 250, cost: 1250, cpl: 125, leads: 10, appt: 0, won: 0, ready: true };
    const w = { leads: 10, avgReply: 12, booked: 4, apptRate: 40, came: 3, due: 4, showRate: 75, won: 1 };
    const t = overviewTiles({ ads: m, adsPrev: { ...m, cost: 1000 }, work: w, workPrev: w } as never, true, "vs Oct");
    expect(t.find(x => x.label === "Total cost")!.tip).toEqual({ sub: ["Total cost = ads spend + marketing fee's share", "RM 1,000.00 + RM 250.00 = RM 1,250.00"], title: "vs Oct: RM 1,000" });
    // Over total leads (the owner, 2026-11-17: "perlead, 除 total leads") — here the period's 10.
    expect(t.find(x => x.label === "Per lead")!.tip.sub).toEqual(["Per lead = (ads spend + fee) ÷ total leads", "RM 1,250.00 ÷ 10 = RM 125.00"]);
    expect(t.find(x => x.label === "Show-up")!.tip.sub[1]).toBe("3 ÷ 4 = 75%");
  });
});

describe("the phone's Overview", () => {
  it("compares with the date sheet's Compare to when one is picked", () => {
    const ctx = (cmp: { a: number; b: number } | null) => ({ ui: { period: "custom", ovRange: NOV, cmp }, now: new Date(2026, 10, 17, 12), patch: () => {}, data, teams: [], directors: [], live: false } as unknown as PanelCtx);
    expect(phoneOverviewProps(ctx(OCT_1_17)).prev).toEqual(OCT_1_17);
    expect(phoneOverviewProps(ctx(null)).prev).toEqual({ a: D(9, 15), b: D(9, 31) });
  });
});

describe("sales, conversion, AOV and ROAS (the owner, 2026-11-17: 新增 conversion rate, total sales, ROAS, AOV)", () => {
  // a and b won (RM 5,000 + RM 3,000); a, b and d came to a visit in November.
  const came = (id: string, d: number) => ({ id: `v${id}`, customerId: id, start: new Date(2026, 10, d, 14).toISOString(), state: "attended" });
  const won = { ...data, customers: data.customers.map((c, i) => (i < 2 ? { ...c, status: "won", wonAmount: i ? 3000 : 5000 } : c)), visits: [came("a", 5), came("b", 6), came("d", 7)] } as unknown as CrmData;
  function vmWon(over: Partial<DeskUi> = {}) {
    let ui: DeskUi = { ...initialDeskUi(), stage: "op", tab: "insight", insPer: "custom", insRange: NOV, ...over };
    const patch = (p: Partial<DeskUi>) => { ui = { ...ui, ...p }; };
    const ctx = () => ({ ui, data: won, now: new Date(2026, 10, 17, 12), nameOf: (x: string) => x, act: {}, deskAct: {}, set: () => {}, patch, teams, directors: [], me: { id: "boss", name: "Boss" } } as unknown as DeskCtx);
    return { run: () => deskOverviewVM(ctx()), ui: () => ui };
  }
  it("are cards, worked out on hover from the Won amount", () => {
    const tiles = vmWon().run().tiles, tile = (l: string) => tiles.find(t => t.label === l)!;
    expect(tile("Total sales").value).toBe("RM 8,000");
    expect(tile("Conversion").value).toBe("67%"); // 2 won of the 3 who showed up
    expect(tile("Conversion").tip.sub).toEqual(["Conversion = won ÷ customers who showed up", "2 ÷ 3 = 67%"]);
    expect(tile("AOV").value).toBe("RM 4,000");
    expect(tile("AOV").tip.sub[1]).toBe("RM 8,000.00 ÷ 2 = RM 4,000.00");
    expect(tile("ROAS").value).toBe("—"); // no spend read yet
    expect(tile("ROAS").tip.sub[1]).toBe("No ads cost read for the period yet");
    expect(tile("Total sales").tip.sub).toContain("Recorded only · commission is unchanged");
  });
  it("ROAS is total sales over total cost, its hover on ads spend alone too", async () => {
    const { overviewTiles } = await import("../../shared/insight-overview");
    const m = { spend: 4834, fee: 2500, cost: 7334, cpl: 125, leads: 10, appt: 0, won: 2, sales: 0, ready: true };
    const w = { leads: 10, avgReply: 12, booked: 4, apptRate: 40, came: 3, due: 4, showRate: 75, won: 2, sales: 12000, wonPaid: 2 };
    const tiles = overviewTiles({ ads: m, adsPrev: m, work: w, workPrev: { ...w, sales: 0, wonPaid: 0 } } as never, true, "vs Oct");
    const roas = tiles.find(x => x.label === "ROAS")!;
    expect(roas.value).toBe("1.64×");
    expect(roas.tip.sub).toEqual(["ROAS = total sales ÷ total cost (ads spend + marketing fee's share)", "RM 12,000 ÷ RM 7,334 = 1.64× (ads + fee)", "RM 12,000 ÷ RM 4,834 = 2.48× (ads only)"]);
    expect(roas.tip.title).toBe("vs Oct: —"); // no sales then: nothing to divide
    expect(tiles.find(x => x.label === "AOV")!.tip.title).toBe("vs Oct: —");
  });
  it("each table keeps its columns; + adds a metric, × takes it off, kept per person (2026-11-17: 此外是 + 数据，不是替换)", () => {
    const saved: unknown[] = [];
    let ui: DeskUi = { ...initialDeskUi(), stage: "op", tab: "insight", insPer: "custom", insRange: NOV };
    const patch = (p: Partial<DeskUi>) => { ui = { ...ui, ...p }; };
    const run = () => deskOverviewVM({ ui, data: won, now: new Date(2026, 10, 17, 12), nameOf: (x: string) => x, act: {}, deskAct: { saveUiPref: (_k: string, v: unknown) => saved.push(v) }, set: () => {}, patch, teams, directors: [], me: { id: "boss", name: "Boss" } } as unknown as DeskCtx);
    expect(run().adCol.cols).toEqual([]); // nothing added: the tables as they were
    expect(run().teams.find(t => t.name === "Team Ann")!.extra).toEqual([]);
    expect(run().adCol.options.map(o => [o.group, o.label])).toEqual([
      ["CRM", "Sales"], ["CRM", "Conversion"], ["CRM", "AOV"], ["CRM", "ROAS"], ["CRM", "Appt rate"],
      ["Meta Ads", "Impressions"], ["Meta Ads", "Reach"], ["Meta Ads", "Frequency"], ["Meta Ads", "CPM"], ["Meta Ads", "Link clicks"],
      ["Meta Ads", "CPC"], ["Meta Ads", "CTR"], ["Meta Ads", "Clicks (all)"], ["Meta Ads", "Conversations"], ["Meta Ads", "Cost / conversation"]]);
    expect(run().teamCol.options.map(o => o.label)).toEqual(["Sales", "Conversion", "AOV"]); // a team has no cost or ad figures
    run().teamCol.options.find(o => o.label === "Sales")!.pick();
    run().teamCol.options.find(o => o.label === "Conversion")!.pick();
    expect(run().teamCol.cols.map(c => c.label)).toEqual(["Sales", "Conversion"]);
    expect(run().teamCol.options.map(o => o.label)).toEqual(["AOV"]); // an added one is not offered twice
    expect(run().teams.find(t => t.name === "Team Ann")!.extra).toEqual(["RM 8,000", "67%"]);
    expect(saved.at(-1)).toEqual({ ads: [], team: ["sales", "conv"] });
    run().teamCol.cols[0].remove();
    expect(run().teamCol.cols.map(c => c.label)).toEqual(["Conversion"]);
    expect(run().adCol.cols).toEqual([]); // the other table keeps its own
  });
  it("reads the kept set back, and an older single pick as one column", () => {
    const at = (ovCols: unknown) => deskOverviewVM({ ui: { ...initialDeskUi(), stage: "op", tab: "insight" }, data: { ...won, uiPrefs: { ovCols } }, now: new Date(2026, 10, 17, 12), nameOf: (x: string) => x, act: {}, deskAct: {}, set: () => {}, patch: () => {}, teams, directors: [], me: { id: "boss", name: "Boss" } } as unknown as DeskCtx);
    expect(at({ ads: ["sales", "cpc"], team: ["aov"] }).adCol.cols.map(c => c.key)).toEqual(["sales", "cpc"]);
    expect(at({ ads: "sales", team: "conv" }).teamCol.cols.map(c => c.key)).toEqual(["conv"]);
    expect(at({ ads: ["nonsense", "sales", "sales"] }).adCol.cols.map(c => c.key)).toEqual(["sales"]);
  });
  it("works Meta's columns out of an ad's figures, and says — before they are read", async () => {
    const { colValue } = await import("../../shared/insight-overview");
    const row = { leads: 10, won: 1, sales: 0, wonPaid: 0, came: 2, cost: 600, fig: { spend: 500, impr: 20000, reach: 8000, clicks: 250, allClicks: 400, msgconv: 40 } };
    expect(["impr", "reach", "freq", "cpm", "clicks", "cpc", "ctr", "allclk", "msgconv", "cpmsg"].map(k => colValue(k as never, row)))
      .toEqual(["20,000", "8,000", "2.50", "RM 25.00", "250", "RM 2.00", "1.25%", "400", "40", "RM 12.50"]);
    expect(colValue("cpc", { ...row, fig: null })).toBe("—");
  });
});
