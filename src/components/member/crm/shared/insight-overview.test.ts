import { describe, expect, it } from "vitest";
import type { CrmData } from "@/lib/member/crm-data";
import { BRAND_WHATSAPP } from "@/lib/member/crm-source";
import { avgReplyOf, change, metaKey, NOBODY, overviewFigures, overviewTiles, type OverviewIn } from "./insight-overview";

// Insight › Overview (the owner, 2026-11-17: "我想在 insight 加 Overview，主要是整合 ads performance + team performance").
const d = (day: number, h = 10, min = 0, m = 11) => new Date(2026, m - 1, day, h, min);
const iso = (day: number, h = 10, min = 0, m = 11) => d(day, h, min, m).toISOString();
const NOV = { a: d(1, 0).getTime(), b: d(17, 0).getTime() }, OCT = { a: d(1, 0, 0, 10).getTime(), b: d(31, 0, 0, 10).getTime() };
const NOW = d(17, 15);
const AD_C = "120200000000000001", AD_D = "120200000000000002";

type C = Record<string, unknown>;
const cust = (id: string, o: C): C => ({ id, name: id, phone: `60${id.length}${id.charCodeAt(0)}${id.charCodeAt(id.length - 1)}`, channel: "whatsapp", accountId: BRAND_WHATSAPP.conts,
  adId: null, ad: "", createdAt: iso(5), assignedTo: null, status: "follow", messages: [], ...o });
const msgs = (day: number, waitMin: number) => [{ from: "lead", at: iso(day, 10, 0) }, { from: "me", at: iso(day, 10, waitMin) }];

function data(): CrmData {
  return {
    customers: [
      // The Conts' ad: two leads in November (Ann's team), one in October.
      cust("c1", { adId: AD_C, ad: "Conts Video", assignedTo: "p1", messages: msgs(5, 10), status: "won" }),
      cust("c2", { adId: AD_C, ad: "Conts Video", assignedTo: "p2", createdAt: iso(6), messages: msgs(6, 30) }),
      cust("c0", { adId: AD_C, ad: "Conts Video", assignedTo: "p1", createdAt: iso(20, 10, 0, 10) }),
      // Dream Crafter's ad: one lead, the Revenue Director's.
      cust("d1", { adId: AD_D, ad: "DC Reel", accountId: BRAND_WHATSAPP.dc, assignedTo: "dir", createdAt: iso(7) }),
      // No ad, nobody yet.
      cust("n1", { createdAt: iso(8) }),
    ],
    visits: [
      { id: "v1", customerId: "c1", state: "attended", start: iso(10, 14) },
      { id: "v2", customerId: "c2", state: "booked", start: iso(20, 14) },
    ],
    adNames: {},
    people: [],
  } as unknown as CrmData;
}

const base = (o: Partial<OverviewIn> = {}): OverviewIn => ({
  data: data(), r: NOV, prev: OCT, now: NOW, directorTeam: "Revenue Director", directors: [{ id: "dir", name: "PETER" }],
  teams: [{ id: "t1", name: "Team Ann", people: [{ id: "p1", name: "ANN" }, { id: "p2", name: "BEN" }] }], src: "all", meta: undefined, money: true, ...o,
});
const fig = (spend: number) => ({ spend, impr: 0, reach: 0, clicks: 0, allClicks: 0, msgconv: 0 });

describe("Insight › Overview's ads", () => {
  it("adds Ads Performance's money: spend, the month's fee, total cost and per lead", () => {
    const meta = { [metaKey(NOV.a, NOV.b)]: { [AD_C]: fig(1000), [AD_D]: fig(500) } };
    const f = overviewFigures(base({ meta }));
    // RM 1,500 spent → the RM 2,500 minimum fee; per lead = (spend + fee) ÷ leads, as Ads Performance's.
    expect(f.ads).toMatchObject({ spend: 1500, fee: 2500, cost: 4000, leads: 4, appt: 2, won: 1, ready: true });
    expect(f.ads.cpl).toBe(1000);
    // Each ad carries its share of the fee (the fee's rate on its own spend).
    const c = f.adRows.find(a => a.id === AD_C)!;
    expect(c).toMatchObject({ name: "Conts Video", brand: "The Conts", leads: 2, appt: 2, won: 1, spend: 1000 });
    expect(c.cost).toBeCloseTo(1000 * (4000 / 1500), 6);
    expect(c.cpl).toBeCloseTo(c.cost! / 2, 6);
  });
  it("ranks the ads by leads, an organic lead as 'No ad', and splits them by brand", () => {
    const f = overviewFigures(base({ meta: { [metaKey(NOV.a, NOV.b)]: { [AD_C]: fig(1000), [AD_D]: fig(500) } } }));
    expect(f.adRows.map(a => [a.name, a.leads])).toEqual([["Conts Video", 2], ["DC Reel", 1], ["No ad · WhatsApp", 1]]);
    expect(f.adRows.find(a => a.name.startsWith("No ad"))).toMatchObject({ paid: false, spend: 0 });
    expect(f.brands.map(b => [b.label, b.leads, b.spend])).toEqual([["The Conts", 3, 1000], ["Dream Crafter", 1, 500]]);
  });
  it("reads '—' until Meta has answered for every ad, and says what to ask for", () => {
    const f = overviewFigures(base());
    expect(f.ads).toMatchObject({ spend: null, fee: null, cost: null, cpl: null, ready: false, leads: 4 });
    const keys = f.need.map(n => n.key);
    expect(keys).toContain(metaKey(NOV.a, NOV.b));
    expect(keys).toContain(metaKey(OCT.a, OCT.b));
    expect(f.need[0].ids.sort()).toEqual([AD_C, AD_D]);
    // Once a range is read it is not asked again.
    const g = overviewFigures(base({ meta: { [metaKey(NOV.a, NOV.b)]: { [AD_C]: fig(1), [AD_D]: null } } }));
    expect(g.need.map(n => n.key)).not.toContain(metaKey(NOV.a, NOV.b));
  });
  it("never asks Meta without CRM · Manage's figures (readsAds)", () => {
    const f = overviewFigures(base({ money: false }));
    expect(f.need).toEqual([]);
    expect(f.ads).toMatchObject({ spend: null, ready: true, leads: 4 });
  });
  it("compares with the period before", () => {
    const meta = { [metaKey(NOV.a, NOV.b)]: { [AD_C]: fig(1000), [AD_D]: fig(500) }, [metaKey(OCT.a, OCT.b)]: { [AD_C]: fig(3000), [AD_D]: fig(0) } };
    const f = overviewFigures(base({ meta }));
    expect(f.adsPrev).toMatchObject({ spend: 3000, leads: 1, cost: 3000 + 2500 });
  });
});

describe("Insight › Overview's team", () => {
  it("lists the Revenue Director, each team and whoever has nobody yet, a team with its people", () => {
    const f = overviewFigures(base());
    expect(f.teams.map(t => [t.name, t.leads])).toEqual([["Revenue Director", 1], ["Team Ann", 2], [NOBODY, 1]]);
    const ann = f.teams[1];
    expect(ann).toMatchObject({ booked: 2, apptRate: 100, won: 1, came: 1, due: 1, showRate: 100, avgReply: 20 });
    expect(ann.people.map(p => [p.name, p.leads, p.avgReply])).toEqual([["ANN", 1, 10], ["BEN", 1, 30]]);
    expect(f.work).toMatchObject({ leads: 4, booked: 2, won: 1, avgReply: 20 });
    expect(f.workPrev.leads).toBe(1);
  });
  it("shows which teams each ad's leads went to", () => {
    const f = overviewFigures(base());
    expect(f.adTeams.find(a => a.id === AD_C)!.teams).toMatchObject([{ key: "t1", name: "Team Ann", leads: 2, booked: 2, won: 1, sales: 0, wonPaid: 0 }]);
    expect(f.adTeams.find(a => a.id === AD_D)!.teams.map(t => t.name)).toEqual(["Revenue Director"]);
    expect(f.adTeams.find(a => a.name.startsWith("No ad"))!.teams.map(t => t.name)).toEqual([NOBODY]);
  });
  it("follows the brand picked: only that brand's customers reach it", () => {
    const all = data();
    const dc = { ...all, customers: all.customers.filter(c => c.accountId === BRAND_WHATSAPP.dc) } as CrmData;
    const f = overviewFigures(base({ data: dc, src: "dc" }));
    expect(f.work.leads).toBe(1);
    expect(f.adRows.map(a => a.name)).toEqual(["DC Reel"]);
    expect(f.teams.map(t => [t.name, t.leads])).toEqual([["Revenue Director", 1], ["Team Ann", 0]]);
  });
});

describe("Insight › Overview's words", () => {
  it("averages each wait to our next reply, auto-replies left out", () => {
    const c = { messages: [{ from: "lead", at: iso(3, 9) }, { from: "me", auto: true, at: iso(3, 9, 1) }, { from: "me", at: iso(3, 9, 40) }] };
    expect(avgReplyOf([c] as never, NOV)).toBe(40);
    expect(avgReplyOf([], NOV)).toBeNull();
  });
  it("says a change and whether it is good news", () => {
    expect(change(120, 100, "count")).toEqual({ d: "+20%", good: true });
    expect(change(80, 100, "cost")).toEqual({ d: "−20%", good: true });
    expect(change(55, 40, "rate")).toEqual({ d: "+15 pts", good: true });
    expect(change(90, 30, "time")).toEqual({ d: "+1 h 0 min", good: false });
    expect(change(5, 0, "count")).toEqual({ d: "New", good: true });
    expect(change(null, 3, "count")).toEqual({ d: "—", good: true });
  });
  it("puts the ads' money first when it may be read, then the team's work", () => {
    const f = overviewFigures(base({ meta: { [metaKey(NOV.a, NOV.b)]: { [AD_C]: fig(1000), [AD_D]: fig(500) } } }));
    expect(overviewTiles(f, true).map(t => [t.label, t.value])).toEqual([
      ["Ads spend", "RM 1,500"], ["Total cost", "RM 4,000"], ["Per lead", "RM 1,000.00"],
      ["Leads", "4"], ["Avg. reply", "20 min"], ["Appt rate", "50%"], ["Show-up", "100%"], ["Won", "1"],
      ["Total sales", "RM 0"], ["Conversion", "100%"], ["AOV", "—"], ["ROAS", "—"]]);
    expect(overviewTiles(f, false).map(t => t.label)).toEqual(["Leads", "Avg. reply", "Appt rate", "Show-up", "Won", "Total sales", "Conversion", "AOV"]);
  });
});
