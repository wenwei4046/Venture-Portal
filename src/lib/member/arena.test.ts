import { describe, expect, it } from "vitest";
import {
  arenaIncentive, arenaMonthFridays, arenaRankings, arenaShortDay, arenaWeekendLabel, arenaWeekFriday, arenaWeeksSoFar,
  type ArenaPerson, type ArenaTier,
} from "./arena";
const row = (id: string, sales: number, cost: number, extra: Partial<ArenaPerson> = {}): ArenaPerson => ({ id, name: id, self: false, sales, held: 0, orders: 1, kpiQty: 2, marginRevenue: sales, marginCost: cost, blindOrders: 0, brands: {}, ...extra });
describe("Live Arena rankings", () => {
  it("keeps competition ties and all sellers, including zero sales", () => {
    const ranks = arenaRankings([row("b",100,50),row("a",100,20),row("c",50,20),row("z",0,0)],"sales");
    expect(ranks.map(p=>[p.id,p.position,p.value])).toEqual([["a",1,100],["b",1,100],["c",3,50],["z",null,0]]);
    expect(ranks.every(p=>!("points" in p))).toBe(true);
  });
  it("keeps incomplete margin pending instead of ranking a partial margin", () => {
    const ranks=arenaRankings([row("incomplete",100,10,{blindOrders:1}),row("complete",100,60),row("none",0,0)],"margin");
    expect(ranks[0]).toMatchObject({id:"complete",position:1,value:40,pending:false});
    expect(ranks.find(p=>p.id==="incomplete")).toMatchObject({position:null,value:null,pending:true});
    expect(ranks.find(p=>p.id==="none")).toMatchObject({position:null,value:null,pending:false});
  });
  it("selects actual brand facts without substituting totals, and KPI has its own metric", () => {
    const a=row("a",1000,500,{kpiQty:3,brands:{AKEMI:{sales:200,held:0,orders:1,kpiQty:1,marginRevenue:200,marginCost:100,blindOrders:0}}});
    expect(arenaRankings([a],"sales","AKEMI")[0].value).toBe(200);
    expect(arenaRankings([a],"sales","ZANOTTI")[0]).toMatchObject({value:null,position:null});
    expect(arenaRankings([a],"kpi")[0].value).toBe(3);
  });
  it("distinguishes missing numeric data from a known zero", () => {
    expect(arenaRankings([row("missing",Number.NaN,0)],"sales")[0]).toMatchObject({position:null,pending:true,value:null});
  });
  it("does not crown inactive or zero-KPI sellers, but ranks an actual negative margin", () => {
    const empty=[row("a",0,0,{orders:0,kpiQty:0}),row("b",0,0,{orders:0,kpiQty:0})];
    for(const metric of ["sales","kpi"] as const) {
      expect(arenaRankings(empty,metric).map(p=>[p.position,p.value,p.hasActivity])).toEqual([[null,0,false],[null,0,false]]);
    }
    expect(arenaRankings([row("sales-only",500,300,{kpiQty:0})],"kpi")[0]).toMatchObject({position:null,value:0,hasActivity:false});
    expect(arenaRankings([row("loss",100,150)],"margin")[0]).toMatchObject({position:1,value:-50,hasActivity:true});
  });
});

// The brand a member worked each week (2026-10-03): the Fair results rank them
// only at that brand's booth that week.
describe("brand weeks", () => {
  it("names a month's weeks by their Fridays, as SQL's member_arena_month_fridays does", () => {
    expect(arenaMonthFridays("2026-09")).toEqual(["2026-09-04","2026-09-11","2026-09-18","2026-09-25"]);
    expect(arenaMonthFridays("2026-10")).toEqual(["2026-10-02","2026-10-09","2026-10-16","2026-10-23","2026-10-30"]);
    expect(arenaMonthFridays("2026-02")).toEqual(["2026-02-06","2026-02-13","2026-02-20","2026-02-27"]);
    expect(arenaMonthFridays("2026-13")).toEqual([]);
  });

  it("labels a week by its weekend, across a month end too", () => {
    expect(arenaWeekendLabel("2026-09-04")).toBe("4–6 Sep");
    expect(arenaWeekendLabel("2026-10-30")).toBe("30 Oct – 1 Nov");
    expect(arenaShortDay("2026-10-06")).toBe("6 Oct");
  });

  it("finds this week's fair weekend: Monday to Saturday look ahead, Sunday looks back", () => {
    expect(arenaWeekFriday("2026-10-12")).toBe("2026-10-16"); // Mon
    expect(arenaWeekFriday("2026-10-16")).toBe("2026-10-16"); // Fri
    expect(arenaWeekFriday("2026-10-17")).toBe("2026-10-16"); // Sat
    expect(arenaWeekFriday("2026-10-18")).toBe("2026-10-16"); // Sun
    expect(arenaWeekFriday("2026-11-01")).toBe("2026-10-30"); // Sun, into the month before
    expect(arenaWeekFriday("2026-11-30")).toBe("2026-12-04"); // Mon, into the month after
  });

  it("keeps this week's brand week and the ones before it, never a later weekend (user 2026-10-12)", () => {
    const weeks = ["2026-10-02", "2026-10-09", "2026-10-16", "2026-10-23", "2026-10-30"].map(week => ({ week }));
    expect(arenaWeeksSoFar(weeks, "2026-10-12").map(w => w.week)).toEqual(["2026-10-02", "2026-10-09", "2026-10-16"]);
    expect(arenaWeeksSoFar(weeks, "2026-10-18").map(w => w.week)).toEqual(["2026-10-02", "2026-10-09", "2026-10-16"]);
    expect(arenaWeeksSoFar(weeks, "2026-10-19").map(w => w.week)).toEqual(["2026-10-02", "2026-10-09", "2026-10-16", "2026-10-23"]);
    expect(arenaWeeksSoFar([], "2026-10-12")).toEqual([]);
  });
});

// Fair's real ladder: the rungs are NOT the same height for every brand.
const LADDER: ArenaTier[] = [
  { brand:"AKEMI", bandKey:"incentive_tier_1", label:"Incentive Tier 1", marginPct:.36, amount:1000 },
  { brand:"AKEMI", bandKey:"incentive_tier_2", label:"Incentive Tier 2", marginPct:.43, amount:1500 },
  { brand:"ZANOTTI", bandKey:"incentive_tier_1", label:"Incentive Tier 1", marginPct:.33, amount:1000 },
  { brand:"ZANOTTI", bandKey:"incentive_tier_2", label:"Incentive Tier 2", marginPct:.36, amount:1500 },
];
// Revenue of 100 at a stated margin, so the percentages read straight off.
const at = (marginPct: number, blindOrders = 0) => ({ sales:100, held:0, orders:1, kpiQty:0, marginRevenue:100, marginCost:100*(1-marginPct), blindOrders });
const blind = () => ({ sales:100, held:0, orders:1, kpiQty:0, marginRevenue:0, marginCost:0, blindOrders:1 });
const seller = (brands: ArenaPerson["brands"]): ArenaPerson =>
  ({ id:"x", name:"x", self:true, sales:0, held:0, orders:0, kpiQty:0, marginRevenue:0, marginCost:0, blindOrders:0, brands });

describe("Arena margin incentive", () => {
  it("stacks the tiers every brand cleared", () => {
    const result = arenaIncentive(seller({ AKEMI: at(.44), ZANOTTI: at(.40) }), LADDER);
    expect(result.amount).toBe(2500);
    expect(result.earned.map(t=>t.bandKey)).toEqual(["incentive_tier_2","incentive_tier_1"]);
    expect(result.blocked).toBeNull();
  });

  it("lets the weakest brand cap the tier, however good the others are", () => {
    // Akemi clears both rungs; Zanotti at 34% clears only its own Tier 1.
    const result = arenaIncentive(seller({ AKEMI: at(.44), ZANOTTI: at(.34) }), LADDER);
    expect(result.amount).toBe(1000);
    expect(result.earned.map(t=>t.bandKey)).toEqual(["incentive_tier_1"]);
  });

  it("reads each brand's own thresholds — 34% earns on Zanotti and nothing on Akemi", () => {
    expect(arenaIncentive(seller({ ZANOTTI: at(.34) }), LADDER).amount).toBe(1000);
    expect(arenaIncentive(seller({ AKEMI: at(.34) }), LADDER).amount).toBe(0);
  });

  it("blocks the whole incentive on one uncosted brand, and names it", () => {
    const result = arenaIncentive(seller({ AKEMI: at(.60), ZANOTTI: blind() }), LADDER);
    expect(result).toMatchObject({ amount:0, earned:[], blocked:{ reason:"no_cost", brand:"ZANOTTI" } });
    expect(result.brands.find(b=>b.brand==="AKEMI")?.marginPct).toBeCloseTo(.60);
  });

  it("puts a bill with no brand ahead of a missing cost, because it blocks either way", () => {
    const result = arenaIncentive(seller({ AKEMI: at(.60), UNCLASSIFIED: at(.50), ZANOTTI: blind() }), LADDER);
    expect(result.blocked).toEqual({ reason:"no_brand" });
  });

  it("blocks a brand the scheme never gave a ladder", () => {
    expect(arenaIncentive(seller({ AKEMI: at(.60), ERGOTEX: at(.60) }), LADDER).blocked)
      .toEqual({ reason:"no_ladder", brand:"ERGOTEX" });
  });

  it("says how far the next rung is, per brand", () => {
    const result = arenaIncentive(seller({ AKEMI: at(.40), ZANOTTI: at(.34) }), LADDER);
    expect(result.brands.find(b=>b.brand==="AKEMI")?.next).toMatchObject({ label:"Incentive Tier 2", marginPct:.43 });
    expect(result.brands.find(b=>b.brand==="AKEMI")?.next?.gap).toBeCloseTo(.03);
    expect(result.brands.find(b=>b.brand==="ZANOTTI")?.next?.gap).toBeCloseTo(.02);
  });

  it("is quiet rather than blocked when nothing was sold", () => {
    expect(arenaIncentive(seller({}), LADDER)).toEqual({ brands:[], blocked:null, earned:[], amount:0 });
  });

  it("ignores a brand that carried no commissionable goods at all", () => {
    const result = arenaIncentive(seller({ AKEMI: at(.44), ZANOTTI: { sales:300, held:0, orders:1, kpiQty:0, marginRevenue:0, marginCost:0, blindOrders:0 } }), LADDER);
    expect(result.brands.map(b=>b.brand)).toEqual(["AKEMI"]);
    expect(result.amount).toBe(2500);
  });

  // HC-SO-2610-096 (2026-10-30): WEI PIN sold Zanotti and gave an Akemi item away on a bill of its own — the engine's rule.
  const given = (cost: number, blindOrders = 0) => ({ sales:0, held:0, orders:1, kpiQty:0, marginRevenue:0, marginCost:cost, blindOrders });
  it("reads a brand given away and never sold as below every tier — judged, not held", () => {
    const result = arenaIncentive(seller({ AKEMI: given(214.29), ZANOTTI: at(.40) }), LADDER);
    expect(result).toMatchObject({ amount:0, earned:[], blocked:null });
    expect(result.brands.find(b=>b.brand==="AKEMI")).toMatchObject({ noSales:true, marginPct:null, cleared:[], next:null });
    expect(result.brands.find(b=>b.brand==="ZANOTTI")).toMatchObject({ noSales:false, cleared:["incentive_tier_1","incentive_tier_2"] });
  });

  it("holds the incentive while a gift on its own still waits for a cost, as an uncosted sale does", () => {
    const result = arenaIncentive(seller({ AKEMI: given(214.29, 1), ZANOTTI: at(.40) }), LADDER);
    expect(result.blocked).toEqual({ reason:"no_cost", brand:"AKEMI" });
    expect(result.brands.find(b=>b.brand==="AKEMI")?.noSales).toBe(false);
  });

  it("still names a bill with no brand first", () => {
    expect(arenaIncentive(seller({ AKEMI: given(100), UNCLASSIFIED: at(.50) }), LADDER).blocked).toEqual({ reason:"no_brand" });
  });
});
