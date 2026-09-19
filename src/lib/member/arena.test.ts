import { describe, expect, it } from "vitest";
import { arenaIncentive, arenaRankings, validArenaBrandWeeks, type ArenaPerson, type ArenaTier } from "./arena";
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
  it("validates exact whole-week allocations without additional brand budgets", () => {
    const counts={AKEMI:3,ERGOTEX:0,ZANOTTI:1,DUNLOP:0};
    expect(validArenaBrandWeeks({weeks:4,counts})).toBe(true);
    for(const value of [{weeks:5,counts},{weeks:4,counts:{...counts,EXTRA:0}},{weeks:4,counts:{...counts,AKEMI:2.5,ZANOTTI:1.5}},{weeks:4,counts:{...counts,AKEMI:5,ZANOTTI:-1}}]) expect(validArenaBrandWeeks(value)).toBe(false);
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
});
