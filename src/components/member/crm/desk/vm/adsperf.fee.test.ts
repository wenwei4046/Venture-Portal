import { describe, expect, it } from "vitest";
import { ALL, FEE_FIXED, feeFixedOf, feeMonths, feeRule, feeTier, feeTyped, feeWorking, marketingFee, monthFee, noAdRepeats, runSplit } from "./adsperf";
import type { CrmCustomer } from "@/lib/member/crm-data";

describe("the Revenue Team's marketing fee", () => {
  it("is a fixed RM 2,500 a month whatever is spent (the owner, 2026-11-25)", () => {
    expect(marketingFee(1)).toBe(2_500);
    expect(marketingFee(10_000)).toBe(2_500);
    expect(marketingFee(50_000)).toBe(2_500);
  });
  it("is nothing with nothing spent, unknown when the spend is", () => {
    expect(marketingFee(0)).toBe(0);
    expect(marketingFee(null)).toBeNull();
  });
  it("has one rule and nothing to reach", () => {
    expect(feeTier(3_151.85)).toMatchObject({ tier: { n: 1, price: "Fixed RM 2,500" }, toNext: null });
    expect(feeTier(50_000)).toMatchObject({ tier: { n: 1 }, toNext: null });
  });
  it("bills by the calendar month: a week shows its month, two months two bills, never a month to come", () => {
    const d = (y: number, m: number, day: number) => new Date(y, m - 1, day).getTime(), today = d(2026, 11, 12);
    expect(feeMonths(d(2026, 11, 9), d(2026, 11, 12), today)).toEqual([[d(2026, 11, 1), today]]);
    expect(feeMonths(d(2026, 10, 14), d(2026, 11, 12), today)).toEqual([[d(2026, 10, 1), d(2026, 10, 31)], [d(2026, 11, 1), today]]);
    expect(feeMonths(d(2025, 12, 20), d(2026, 1, 5), today)).toEqual([[d(2025, 12, 1), d(2025, 12, 31)], [d(2026, 1, 1), d(2026, 1, 31)]]);
  });
  it("needs no working out", () => {
    expect(feeWorking(3_192)).toBe("");
    expect(feeWorking(0)).toBe("No spend, no fee");
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

// 2026-11-25 (the owner: "每个品牌各2500"): each brand that spent pays its own RM 2,500 in a month.
describe("the fee for each brand", () => {
  const BRAND: Record<string, "conts" | "dc" | null> = { c1: "conts", c2: "conts", d1: "dc", x1: null };
  const SPEND: Record<string, number> = { c1: 4_000, c2: 2_901, d1: 600, x1: 50 };
  const spendOf = (ids: string[]) => ids.reduce((n, id) => n + SPEND[id], 0);
  it("is RM 2,500 for each brand with spend", () => {
    expect(monthFee(["c1", "c2", "d1"], id => BRAND[id], spendOf)).toMatchObject({ spent: 7_501, fee: 5_000 });
    expect(monthFee(["c1", "c2"], id => BRAND[id], spendOf)).toMatchObject({ spent: 6_901, fee: 2_500 });
  });
  it("bills no brand that spent nothing", () => {
    expect(monthFee(["c1", "d1"], id => BRAND[id], ids => (ids.includes("d1") ? 0 : 4_000))).toMatchObject({ spent: 4_000, fee: 2_500 });
  });
  it("adds an ad of no known brand's spend, billing it alone only when no brand spent", () => {
    expect(monthFee(["c1", "x1"], id => BRAND[id], spendOf)).toMatchObject({ spent: 4_050, fee: 2_500 });
    expect(monthFee(["x1"], id => BRAND[id], spendOf)).toMatchObject({ spent: 50, fee: 2_500 });
  });
  it("is unknown until every ad's spend is read", () => {
    expect(monthFee(["c1", "d1"], id => BRAND[id], ids => (ids.includes("d1") ? null : 1))).toBeNull();
  });
});

// 2026-11-27 (the owner: "RM 2500 的 marketing fee 变成可调整式 … 调整为0时，其他数据也会跟着变动"; "DC & IR 都一样").
describe("the viewer's own fee", () => {
  const BRAND: Record<string, "conts" | "dc" | null> = { c1: "conts", d1: "dc" };
  const spendOf = (ids: string[]) => ids.length * 1_000;
  it("is RM 2,500 until the viewer sets it, then their figure — 0 too", () => {
    expect(feeFixedOf(undefined)).toBe(FEE_FIXED);
    expect(feeFixedOf({})).toBe(2_500);
    expect(feeFixedOf({ mktFee: 1_800 })).toBe(1_800);
    expect(feeFixedOf({ mktFee: 0 })).toBe(0);
    expect(feeFixedOf({ mktFee: -5 })).toBe(2_500);
    expect(feeFixedOf({ mktFee: "900" })).toBe(2_500);
  });
  it("is the same figure for every brand, and RM 0 bills the brands at nothing", () => {
    expect(monthFee(["c1", "d1"], id => BRAND[id], spendOf, 1_800)).toEqual({ spent: 2_000, fee: 3_600, billed: 2 });
    expect(monthFee(["c1", "d1"], id => BRAND[id], spendOf, 0)).toEqual({ spent: 2_000, fee: 0, billed: 2 });
    expect(marketingFee(5_000, 0)).toBe(0);
    expect(feeRule(0).price).toBe("Fixed RM 0");
    expect(feeRule(1_800).rule).toBe("Fixed RM 1,800 a month for each brand that spent");
  });
  it("reads what is typed as ringgit to the sen, refusing anything else", () => {
    expect(feeTyped("2,000")).toBe(2_000);
    expect(feeTyped("RM 1500.50")).toBe(1_500.5);
    expect(feeTyped("0")).toBe(0);
    expect(feeTyped("")).toBeNull();
    expect(feeTyped("-1")).toBeNull();
    expect(feeTyped("abc")).toBeNull();
    expect(feeTyped("2000000")).toBeNull();
  });
});
