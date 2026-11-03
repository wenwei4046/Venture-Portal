import { describe, expect, it } from "vitest";
import { readDepartmentInsight, readInsightRange, readOrderBook } from "./order-book";

const raw = () => ({
  from: "2026-09", through: "2026-09", asOf: "2026-10-04T12:00:00Z", paysFrom: "2026-09", closedMonths: ["2026-08", "bad"],
  costDivisor: 0.7, brandWeeks: { "2026-09-11": "akemi", junk: "X" },
  orders: [{
    id: "o1", number: "HC-SO-2609-219", ref: "HC11523", customer: "FARAH", date: "2026-09-25", sourceMonth: "2026-09", recognitionMonth: "2026-09",
    brand: "AKEMI", booth: "AKEMI", venue: "IOI MALL PUTRAJAYA", fairStart: "2026-09-25", fairEnd: "2026-09-27", organiser: "MEGAHOME",
    week: "2026-09-25", revenue: 1000, margin: null, kpiQty: 0, cleared: true, carried: false, manual: false, total: 1000, paid: 1000, depositNeeded: 300,
    cost: 450, // a key the app must never carry
    lines: [{ name: "DIVAN", code: "DIVAN-K", qty: 1, amount: 1000, goods: true, kpiQty: 0, cost_amount: 450 }],
  }],
});

describe("readOrderBook", () => {
  it("projects the bills field by field — a cost the RPC might add stays behind", () => {
    const book = readOrderBook(raw())!;
    expect(book.orders[0]).not.toHaveProperty("cost");
    expect(book.orders[0].lines[0]).not.toHaveProperty("cost_amount");
    expect(book.orders[0]).toMatchObject({ number: "HC-SO-2609-219", ref: "HC11523", margin: null, booth: "AKEMI" });
    expect(book.closedMonths).toEqual(["2026-08"]);
    expect(book.brandWeeks).toEqual({ "2026-09-11": "AKEMI" });
  });
  // 2026-10-05 (user): the RPC still hands back the scheme's cost ratio; the
  // phone must never receive it.
  it("keeps the cost ratio the RPC returns on the server", () => {
    const book = readOrderBook(raw())!;
    expect(book).not.toHaveProperty("costDivisor");
    expect(JSON.stringify(book)).not.toContain("0.7");
  });
  it("refuses a shape it does not read", () => {
    const broken = raw();
    (broken.orders[0] as Record<string, unknown>).lines = null;
    expect(readOrderBook(broken)).toBeNull();
    expect(readOrderBook({ ...raw(), from: "Sep" })).toBeNull();
  });
  // Shared bills in the Revenue app (2026-10-21, mig 20261021150000): a bill somebody shared with the reader is not
  // theirs to share, and says who holds it.
  it("reads whose bill it is and who holds a shared one — an answer from before both is the reader's own, unshared", () => {
    expect(readOrderBook(raw())!.orders[0]).toMatchObject({ own: true, share: null });
    const shared = raw();
    Object.assign(shared.orders[0], {
      own: false,
      share: { part: 0.5, holders: [{ id: "lucas", name: "LUCAS", pct: 0.5, owner: true }, { id: "me", name: "ANTHONY", pct: 0.5, owner: false }] },
    });
    expect(readOrderBook(shared)!.orders[0]).toMatchObject({
      own: false,
      share: { part: 0.5, holders: [{ id: "lucas", name: "LUCAS", pct: 0.5, owner: true }, { id: "me", name: "ANTHONY", pct: 0.5, owner: false }] },
    });
  });
});

// 2026-10-30 (mig 20261030083500): a gift on a bill of its own has no margin, and its cost counts against the month —
// which the server alone can add up, since no bill reaches the phone with a cost.
describe("readOrderBook — a bill with no sales, and the margins the server works out", () => {
  const MARGINS = { overall: 35.5, brands: { AKEMI: 35.5, DUNLOP: null }, months: { "2026-09": { overall: 35.5, brands: { AKEMI: 35.5, DUNLOP: null } } } };
  const withMargins = (margins: unknown = MARGINS) => {
    const r = raw();
    Object.assign(r.orders[0], { revenue: 0, total: 0, noSales: true });
    return { ...r, margins };
  };
  it("reads which bill has no sales — an answer from before says nothing", () => {
    expect(readOrderBook(withMargins())!.orders[0].noSales).toBe(true);
    expect(readOrderBook(raw())!.orders[0]).not.toHaveProperty("noSales");
  });
  it("reads the margins as percentages, each month's too — an answer from before has none", () => {
    expect(readOrderBook(withMargins())!.margins).toEqual(MARGINS);
    expect(readOrderBook(raw())).not.toHaveProperty("margins");
  });
  it("drops margins it cannot read, so the app adds the bills up itself", () => {
    expect(readOrderBook(withMargins({ overall: "35%", brands: {} }))).not.toHaveProperty("margins");
    expect(readOrderBook(withMargins({ overall: 35, brands: { AKEMI: "a lot" } }))).not.toHaveProperty("margins");
    expect(readOrderBook(withMargins({ ...MARGINS, months: { Sep: { overall: 35, brands: {} } } }))).not.toHaveProperty("margins");
  });
  it("carries no cost with them, whatever the RPC adds", () => {
    const book = readOrderBook(withMargins({ ...MARGINS, cost: 4500, months: { "2026-09": { ...MARGINS.months["2026-09"], cost: 4500 } } }))!;
    expect(JSON.stringify(book.margins)).not.toContain("4500");
    expect(book.orders[0]).not.toHaveProperty("cost");
  });
});

describe("readInsightRange", () => {
  const score = { staffId: "s1", sales: 10, held: 0, orders: 1, kpiQty: 0, marginRevenue: 10, marginCost: 6, blindOrders: 0, lastOrder: "2026-09-30" };
  it("reads me and the downline", () => {
    const r = readInsightRange({ from: "2026-07", through: "2026-09", asOf: "x", me: { ...score, name: "ETHAN" }, downline: [{ ...score, staffId: "s2", name: "A", title: "RS", uplineId: "s1", depth: 1 }] })!;
    expect(r.me.name).toBe("ETHAN");
    expect(r.downline[0]).toMatchObject({ staffId: "s2", depth: 1, uplineId: "s1" });
  });
  it("refuses a score with a missing number", () => {
    expect(readInsightRange({ from: "2026-07", through: "2026-09", asOf: "x", me: { ...score, sales: "10" }, downline: [] })).toBeNull();
  });
});

// The Principal viewing nobody (2026-10-25, mig 20261026014700): the whole sub-department's Insight, and its bills with
// whose each is.
describe("the whole sub-department", () => {
  const score = { sales: 10, held: 0, orders: 1, kpiQty: 0, marginRevenue: 10, marginCost: 6, blindOrders: 0 };
  const whole = () => ({
    membershipId: "fair", schemeId: "s", department: "Fair", from: "2026-10", through: "2026-10", asOf: "x", live: true, team: score,
    people: [{ ...score, staffId: "s1", name: "LUCAS", title: "TL", uplineId: null, depth: 1, lastOrder: null, salary: 3500 }],
    kpi: { enabled: false, threshold: 30 },
  });
  it("reads every bill summed and everybody's own figures — nothing else the RPC might add", () => {
    const d = readDepartmentInsight(whole())!;
    expect(d.team).toEqual(score);
    expect(d.people[0]).toMatchObject({ staffId: "s1", name: "LUCAS", depth: 1 });
    expect(d.people[0]).not.toHaveProperty("salary");
    // KPI off: no threshold to speak of.
    expect(d.kpi).toEqual({ enabled: false, threshold: null });
    expect(readDepartmentInsight({ ...whole(), kpi: { enabled: true, threshold: 30 } })!.kpi).toEqual({ enabled: true, threshold: 30 });
    expect(readDepartmentInsight({ ...whole(), team: null })).toBeNull();
    expect(readDepartmentInsight({ ...whole(), from: "Oct" })).toBeNull();
  });
  it("a bill names its salesperson on the whole book only", () => {
    expect(readOrderBook(raw())!.orders[0]).not.toHaveProperty("seller");
    const all = raw();
    Object.assign(all.orders[0], { own: false, seller: { id: "lucas", name: "LUCAS" } });
    expect(readOrderBook(all)!.orders[0]).toMatchObject({ own: false, seller: { id: "lucas", name: "LUCAS" } });
    Object.assign(all.orders[0], { seller: null });
    expect(readOrderBook(all)!.orders[0].seller).toBeNull();
  });
});
