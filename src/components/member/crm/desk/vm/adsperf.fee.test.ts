import { describe, expect, it } from "vitest";
import { ALL, feeMonths, feeTier, feeWorking, marketingFee, noAdRepeats, runSplit } from "./adsperf";
import type { CrmCustomer } from "@/lib/member/crm-data";

describe("the Revenue Team's marketing fee", () => {
  it("is the owner's three samples", () => {
    expect(marketingFee(10_000)).toBe(2_500); // the minimum
    expect(marketingFee(20_000)).toBe(5_000); // 25%
    expect(marketingFee(50_000)).toBe(11_500); // 7,500 (25% of 30k) + 4,000 (20% of 20k)
  });
  it("stacks the ladder at RM 30,000", () => {
    expect(marketingFee(30_000)).toBe(7_500);
    expect(marketingFee(30_001)).toBeCloseTo(7_500.2, 5);
  });
  it("is nothing with nothing spent, unknown when the spend is", () => {
    expect(marketingFee(0)).toBe(0);
    expect(marketingFee(null)).toBeNull();
  });
  it("names the tier a month's spend has reached, and the spend to the next", () => {
    expect(feeTier(3_151.85)).toMatchObject({ tier: { n: 1 }, toNext: 6_848.15 });
    expect(feeTier(10_000)).toMatchObject({ tier: { n: 2 }, toNext: 20_000 });
    expect(feeTier(30_000)).toMatchObject({ tier: { n: 2 }, toNext: 0 });
    expect(feeTier(50_000)).toMatchObject({ tier: { n: 3 }, toNext: null });
  });
  it("bills by the calendar month: a week shows its month, two months two bills, never a month to come", () => {
    const d = (y: number, m: number, day: number) => new Date(y, m - 1, day).getTime(), today = d(2026, 11, 12);
    expect(feeMonths(d(2026, 11, 9), d(2026, 11, 12), today)).toEqual([[d(2026, 11, 1), today]]);
    expect(feeMonths(d(2026, 10, 14), d(2026, 11, 12), today)).toEqual([[d(2026, 10, 1), d(2026, 10, 31)], [d(2026, 11, 1), today]]);
    expect(feeMonths(d(2025, 12, 20), d(2026, 1, 5), today)).toEqual([[d(2025, 12, 1), d(2025, 12, 31)], [d(2026, 1, 1), d(2026, 1, 31)]]);
  });
  it("writes its working out", () => {
    expect(feeWorking(3_192)).toBe(""); // under the minimum: its Tier 1 line says it (2026-11-16)
    expect(feeWorking(20_000)).toBe("25% × RM 20,000 = RM 5,000");
    expect(feeWorking(50_000)).toBe("25% × RM 30,000 + 20% × RM 20,000 = RM 7,500 + RM 4,000 = RM 11,500");
  });
  it("is the overview's alone — never an ad's column", () => {
    const keys = ALL.map(m => m[0]);
    expect(keys).not.toContain("mktfee");
    expect(keys).not.toContain("totalcost");
  });
});

// 2026-11-16 (the owner, Total cost RM 7,142 beside Spent RM 1,151 with Running picked: hovering Spent shows the running ads'
// spend and the paused ads'; "leads 也是"): the two parts add up to Total cost's spend, and the running leads to the list's.
describe("Spent's and Leads' running / paused parts", () => {
  const cs = (n: number) => Array.from({ length: n }, () => ({}) as CrmCustomer);
  const ads = [{ id: "111111", cs: cs(14) }, { id: "222222", cs: cs(5) }, { id: "333333", cs: cs(3) }];
  const status = (id: string) => (id === "333333" ? "Paused" : "Running");
  const SPEND: Record<string, number> = { "111111": 700, "222222": 451.17, "333333": 3_491.11 };
  const spendOf = (ids: string[]) => ids.reduce((n, id) => n + (SPEND[id] ?? 0), 0);
  const leadsOf = (c: CrmCustomer[]) => c.length;
  it("splits the month's spend of every ad and the list's leads by Running", () => {
    const s = runSplit(ads, status, Object.keys(SPEND), [[0, 1]], 0, 1, spendOf, leadsOf);
    expect(s.spend!.running).toBeCloseTo(1_151.17, 2);
    expect(s.spend!.paused).toBeCloseTo(3_491.11, 2);
    expect(s.spend!.running + s.spend!.paused).toBeCloseTo(4_642.28, 2); // Total cost's spend
    expect(s.leads).toEqual({ running: 19, paused: 3 });
  });
  it("says nothing of the spend until every month is read", () => {
    expect(runSplit(ads, status, Object.keys(SPEND), [[0, 1]], 0, 1, () => null, leadsOf).spend).toBeNull();
  });
});

// 2026-11-16 (the owner, of November's 17 "no ad" leads, 6 the same people as Instant Form leads: "他们的聊天室不动，但是 ads
// performance 的数字要更动，不然数据会不准"): such a customer is not counted a second time.
describe("a no-ad customer who is already an ad's lead", () => {
  const c = (id: string, adId: string | null, phone: string, name: string, at: string) => ({ id, adId, phone, name, createdAt: at });
  const rows = [
    c("form1", "ad1", "+600123451100", "Andrew Wong", "2026-11-15T04:51:00Z"), c("wa1", null, "+60123451100", "Andrew Wong", "2026-11-15T05:02:00Z"), // "+60 0…"
    c("form2", "ad1", "+600123458728", "Jollene", "2026-11-15T07:09:00Z"), c("wa2", null, "+60123458728", "Ka Xin", "2026-11-15T14:36:00Z"), // same phone, other name
    c("form3", "ad2", "+60123456976", "Ng Stanley", "2026-11-13T14:17:00Z"), c("ms3", null, "", "Ng Stanley", "2026-11-13T14:17:30Z"), // its Messenger chat
    c("ms4", null, "", "Katherine Chee", "2026-11-01T11:26:00Z"), // nobody's else
    c("ms5", null, "", "Ng Stanley", "2026-11-14T14:17:00Z"), // the same name a day later: somebody else
    c("wa6", null, "+60129990000", "Lim", "2026-11-16T02:01:00Z"),
  ];
  it("is the same phone, or the same name within 10 minutes, as an ad's customer", () => {
    expect([...noAdRepeats(rows)].sort()).toEqual(["ms3", "wa1", "wa2"]);
  });
});
