import { describe, expect, it } from "vitest";
import { arenaRankings, validArenaBrandWeeks, type ArenaPerson } from "./arena";
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
