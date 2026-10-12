import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MemberArenaSnapshot } from "@/lib/member/arena";
import MemberArena from "./MemberArena";

const actions = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock("@/app/(member)/member/arena-actions", () => ({ fetchMemberArena: actions.fetch }));
// September 2026 on 3 October: the first three weekends have closed, the last is open until 6 October.
const weekLocks=[{week:"2026-09-04",closesOn:"2026-09-13",locked:true},{week:"2026-09-11",closesOn:"2026-09-20",locked:true},
  {week:"2026-09-18",closesOn:"2026-09-27",locked:true},{week:"2026-09-25",closesOn:"2026-10-06",locked:false}];
const membershipId="10000000-0000-4000-8000-000000000001";
const snapshot: MemberArenaSnapshot={membershipId,department:"Fair",selfId:"real-employee",period:"2026-09",window:"monthly",from:"2026-09-01",through:"2026-09-16",asOf:"2026-09-16T00:00:00Z",live:true,
  brands:[{code:"AKEMI",name:"Akemi"}],brandWeeks:null,
  tiers:[{brand:"AKEMI",bandKey:"incentive_tier_1",label:"Incentive Tier 1",marginPct:.36,amount:1000},
    {brand:"AKEMI",bandKey:"incentive_tier_2",label:"Incentive Tier 2",marginPct:.43,amount:1500}],
  people:[
    {id:"real-employee",name:"Actual Employee",self:true,sales:4000,held:0,orders:1,kpiQty:3,marginRevenue:4000,marginCost:2000,blindOrders:0,brands:{AKEMI:{sales:4000,held:0,orders:1,kpiQty:3,marginRevenue:4000,marginCost:2000,blindOrders:0}}},
    {id:"colleague",name:"Other Employee",self:false,sales:8000,held:0,orders:1,kpiQty:2,marginRevenue:8000,marginCost:6000,blindOrders:0,brands:{}},
  ]};
beforeEach(()=>{actions.fetch.mockReset().mockResolvedValue({ok:true,data:structuredClone(snapshot)});});
const history=(weeks:object[],events:object[]=[])=>({asOf:"2026-10-12T00:00:00Z",provisional:true as const,unassignedOrders:0,unassignedSales:0,
  championship:{status:"pending" as const,reason:"Pending."},events,weeks});
const brandWeek=(week:string,source:"erp"|"auto",brand:string,venue:string)=>({staffId:"real-employee",week,source,brand,fairId:"f",venue,
  organizer:"MLE",start:week,end:week,booths:source==="erp"?1:null});
afterEach(cleanup);
describe("Live Member Arena",()=>{
  // Brand weeks come from the ERP's Sales Attending (2026-10-12): the Principal's view of a member reads
  // them like the member does — nothing to pick, nothing to save.
  it("shows selected Principal results and the member's brand weeks, read only",async()=>{
    const context={staffId:"real-employee",subDepartmentId:membershipId};
    actions.fetch.mockResolvedValue({ok:true,data:{...structuredClone(snapshot),principalView:true,selfId:"",viewedStaffId:context.staffId,weekLocks,
      people:snapshot.people.map(person=>({...person,self:false})),
      history:history([brandWeek("2026-09-18","erp","ZANOTTI","MVEC SOUTHKEY"),brandWeek("2026-09-25","erp","AKEMI","PENANG WATERFRONT")])}});
    render(<MemberArena membershipId={membershipId} context={context}/>);
    fireEvent.click(await screen.findByRole("button",{name:/Sales Ranking/}));
    expect(actions.fetch).toHaveBeenCalledWith(membershipId,expect.any(String),"monthly",context);
    expect(screen.getByText("Actual Employee · Result")).toBeInTheDocument();
    expect(screen.queryByText("You")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button",{name:"Arena"}));
    expect(screen.getByRole("button",{name:/Member brand weeks/})).toHaveTextContent("2 of 4 weeks from the ERP");
    fireEvent.click(screen.getByRole("button",{name:/Member brand weeks/}));
    const weeks=within(screen.getByRole("region",{name:"Actual Employee’s brand weeks"}));
    expect(weeks.getByText("Weekend of 18–20 Sep").closest("li")).toHaveTextContent("From the ERP’s Sales AttendingZanottiMVEC SOUTHKEY · MLE");
    expect(weeks.queryAllByRole("combobox")).toEqual([]);
    expect(weeks.queryAllByRole("button")).toEqual([]);
  });

  it("says which weekends the ERP lists the member at, which were auto-located, and which had none",async()=>{
    actions.fetch.mockResolvedValue({ok:true,data:{...structuredClone(snapshot),weekLocks,
      history:history([brandWeek("2026-09-04","erp","AKEMI","SUNWAY PYRAMID"),brandWeek("2026-09-18","auto","ZANOTTI","MVEC SOUTHKEY")])}});
    render(<MemberArena membershipId={membershipId}/>);
    fireEvent.click(await screen.findByRole("button",{name:/My brand weeks/}));
    const weeks=within(screen.getByRole("region",{name:"My brand weeks"}));
    expect(weeks.getByText("Weekend of 4–6 Sep").closest("li")).toHaveTextContent("From the ERP’s Sales Attending");
    expect(weeks.getByText("Weekend of 11–13 Sep").closest("li")).toHaveTextContent("No fair this weekend");
    expect(weeks.getByText("Weekend of 18–20 Sep").closest("li")).toHaveTextContent("Auto-located · the booth with the most bills");
    expect(screen.queryByRole("button",{name:"Save brand weeks"})).not.toBeInTheDocument();
  });

  it("discards an old member response after the Principal selects another member",async()=>{
    let first!:(value:unknown)=>void;
    actions.fetch.mockReturnValueOnce(new Promise(resolve=>{first=resolve;}));
    const {rerender}=render(<MemberArena membershipId={membershipId} context={{staffId:"real-employee",subDepartmentId:membershipId}}/>);
    rerender(<MemberArena membershipId={membershipId} context={{staffId:"colleague",subDepartmentId:membershipId}}/>);
    expect(await screen.findByRole("button",{name:/Sales Ranking/})).toHaveTextContent("#1");
    first({ok:true,data:{...snapshot,people:[]}});
    await waitFor(()=>expect(screen.getByRole("button",{name:/Sales Ranking/})).toHaveTextContent("#1"));
  });
  it("shows real own ranks and uses the selected period without demo people or score totals",async()=>{
    render(<MemberArena membershipId={membershipId}/>);
    await screen.findByRole("button",{name:/Sales Ranking/});
    expect(screen.getByRole("button",{name:/Sales Ranking/})).toHaveTextContent("#2");
    expect(screen.getByRole("button",{name:/Margin Ranking/})).toHaveTextContent("#1");
    expect(screen.queryByText("Jia En")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button",{name:"Quarterly"}));
    await waitFor(()=>expect(actions.fetch).toHaveBeenLastCalledWith(membershipId,expect.any(String),"quarterly"));
    await screen.findByRole("button",{name:/Sales Ranking/});
    fireEvent.click(screen.getByRole("button",{name:/Sales Ranking/}));
    expect(screen.getByRole("heading",{name:"Sales Ranking",level:1})).toBeInTheDocument();
    expect(screen.getByRole("combobox",{name:"Ranking by"})).toBeInTheDocument();
    expect(screen.getAllByText("Actual Employee").length).toBeGreaterThan(0);
    expect(screen.queryByText(/pts/)).not.toBeInTheDocument();
  });
  it("never falls back to fictional data after a service error",async()=>{
    actions.fetch.mockResolvedValue({ok:false,error:"Arena is not enabled for this account."});
    render(<MemberArena membershipId={membershipId}/>);
    expect(await screen.findByRole("alert")).toHaveTextContent("Arena is not enabled");
    expect(screen.queryByRole("button",{name:/Sales Ranking/})).not.toBeInTheDocument();
    expect(screen.getByRole("button",{name:"Try again"})).toBeInTheDocument();
  });
  it("shows known zeros without presenting inactive sellers as podium winners",async()=>{
    const empty=structuredClone(snapshot);
    empty.people=empty.people.map(person=>({...person,sales:0,kpiQty:0,orders:0,marginRevenue:0,marginCost:0,brands:{}}));
    actions.fetch.mockResolvedValue({ok:true,data:empty});
    render(<MemberArena membershipId={membershipId}/>);
    const sales=await screen.findByRole("button",{name:/Sales Ranking/});
    expect(sales).toHaveTextContent("RM 0");
    expect(sales).not.toHaveTextContent("#1");
    expect(screen.getByRole("button",{name:/KPI Ranking/})).toHaveTextContent("0 items");
    fireEvent.click(sales);
    expect(screen.queryByRole("region",{name:"Top three"})).not.toBeInTheDocument();
    expect(screen.getByText("Not ranked")).toBeInTheDocument();
  });
  // One brand week a weekend (2026-10-03), from the ERP since 2026-10-12: before the ERP has sent its Sales
  // Attending the page lists the month's weekends with nothing to pick.
  it("lists the month's weekends with nothing to pick before the ERP lists anybody",async()=>{
    render(<MemberArena membershipId={membershipId}/>);
    expect(await screen.findByRole("button",{name:/My brand weeks/})).toHaveTextContent("0 of 4 weeks from the ERP");
    fireEvent.click(screen.getByRole("button",{name:/My brand weeks/}));
    expect(screen.getByText("Weekend of 4–6 Sep")).toBeInTheDocument();
    expect(screen.getAllByText("No fair this weekend")).toHaveLength(4);
    expect(screen.queryAllByRole("combobox",{name:/Brand for week/})).toEqual([]);
    expect(screen.queryByRole("button",{name:"Save brand weeks"})).not.toBeInTheDocument();
  });
  it("keeps deferred Fair and Championship information explicit without manufacturing points",async()=>{
    render(<MemberArena membershipId={membershipId}/>);
    fireEvent.click(await screen.findByRole("button",{name:/Championship & Fair results/}));
    expect(screen.getByRole("heading",{name:"Fair history is not connected yet"})).toBeInTheDocument();
    expect(screen.getByText(/Championship totals will appear/)).toBeInTheDocument();
    expect(screen.queryByText(/\d+\s*pts/)).not.toBeInTheDocument();
  });
  it("ranks the fairs that closed in the period and counts what no fair could claim",async()=>{
    actions.fetch.mockResolvedValue({ok:true,data:{...structuredClone(snapshot),history:{
      asOf:"2026-09-16T00:00:00Z",provisional:true as const,unassignedOrders:2,unassignedSales:5000,
      championship:{status:"pending" as const,reason:"Championship totals need every ranking source and a settled scoring ledger."},
      events:[{id:"fair-1",venue:"SPICE ARENA",start:"2026-09-05",end:"2026-09-07",periodMonth:"2026-09",people:[
        {id:"real-employee",name:"Actual Employee",sales:4000,held:0,orders:1},
        {id:"colleague",name:"Other Employee",sales:8000,held:0,orders:1}]}]}}});
    render(<MemberArena membershipId={membershipId}/>);
    fireEvent.click(await screen.findByRole("button",{name:/Championship & Fair results/}));
    expect(screen.queryByRole("heading",{name:"Fair history is not connected yet"})).not.toBeInTheDocument();
    expect(screen.getByText(/Provisional results/)).toBeInTheDocument();
    expect(screen.getByRole("heading",{name:"Your fair finishes"})).toBeInTheDocument();
    expect(screen.getByText("SPICE ARENA")).toBeInTheDocument();
    expect(screen.getByRole("heading",{name:"Highest Fair Record"})).toBeInTheDocument();
    expect(screen.getByText(/RM 5,000 over 2 bills sits on no fair yet/)).toBeInTheDocument();
    expect(screen.queryByText(/\d+\s*pts/)).not.toBeInTheDocument();
  });
  // Booth by booth (2026-10-03): one board per brand's booth holding every
  // bill written there. A seller is ranked on every board they sold at, and
  // only the brand week's place earns (user: 你照样上榜，只是你上榜了没有拿到
  // 积分 … 依然会显示属于那个名次).
  it("ranks each booth on its own, and shows a seller's place at another booth without points",async()=>{
    actions.fetch.mockResolvedValue({ok:true,data:{...structuredClone(snapshot),history:{
      asOf:"2026-09-28T00:00:00Z",provisional:true as const,unassignedOrders:0,unassignedSales:0,offWeekOrders:3,offWeekSales:13588,
      championship:{status:"pending" as const,reason:"Championship totals need every ranking source and a settled scoring ledger."},
      events:[
        {id:"f1|AKEMI",fairId:"f1",brand:"AKEMI",week:"2026-09-11",venue:"MID VALLEY",start:"2026-09-11",end:"2026-09-13",periodMonth:"2026-09",people:[
          {id:"real-employee",name:"Actual Employee",sales:4000,held:0,orders:1,source:"auto",scoring:true}]},
        {id:"f1|ZANOTTI",fairId:"f1",brand:"ZANOTTI",week:"2026-09-11",venue:"MID VALLEY",start:"2026-09-11",end:"2026-09-13",periodMonth:"2026-09",people:[
          {id:"colleague",name:"Other Employee",sales:8000,held:0,orders:1,source:"erp",scoring:true},
          // Sold more at Zanotti than its own seller, but it is not this week's scoring booth.
          {id:"real-employee",name:"Actual Employee",sales:9000,held:0,orders:1,source:"auto",scoring:false}]}]}}});
    render(<MemberArena membershipId={membershipId}/>);
    expect(await screen.findByRole("button",{name:/Championship & Fair results/})).toHaveTextContent("2 completed booths");
    fireEvent.click(screen.getByRole("button",{name:/Championship & Fair results/}));
    const weekly=screen.getByRole("list",{name:"Your weekly fair results"});
    const [akemi,zanotti]=within(weekly).getAllByRole("listitem");
    // First at the Akemi booth, though the Zanotti booth's seller sold more.
    expect(akemi).toHaveTextContent("AKEMI · MID VALLEY");
    expect(akemi).toHaveTextContent("1st");
    // First on the Zanotti board too — the place stands — with no points for it.
    expect(zanotti).toHaveTextContent("ZANOTTI · MID VALLEY");
    expect(zanotti).toHaveTextContent("No points · not this week’s scoring booth");
    expect(zanotti).toHaveTextContent("1st");
    expect(screen.getByText(/Other booths, no points/)).toBeInTheDocument();
    // Other Employee is second there, and that second is their medal; the off-week first is nobody's.
    const other=screen.getByRole("row",{name:/Other Employee/});
    expect(within(other).getByLabelText("1 time in 2nd place")).toBeInTheDocument();
    expect(within(other).getByLabelText("0 times in 1st place")).toBeInTheDocument();
    const mine=screen.getByRole("row",{name:/Actual Employee/});
    expect(mine).toHaveTextContent("1 fair");
    expect(within(mine).getByLabelText("1 time in 1st place")).toBeInTheDocument();
    expect(screen.getByText("Auto-located · not on the ERP’s Sales Attending")).toBeInTheDocument();
    expect(screen.getByText(/1 of your fair finishes was auto-located: the ERP’s Sales Attending lists you at no booth that weekend/)).toBeInTheDocument();
    expect(screen.getByText(/RM 13,588 over 3 bills were written at another booth than the seller’s brand week.*earn no points there/)).toBeInTheDocument();
    // The record is the scoring booth's 4,000, not the 9,000 off the brand week.
    expect(screen.getByText(/^AKEMI · MID VALLEY · 11 Sept? – 13 Sept?$/)).toBeInTheDocument();
  });
  // Brand weeks come from the ERP (2026-10-12): a placement by the bills is auto-located, open week or closed,
  // and the page says the ERP is where it changes; a placement the ERP made says nothing.
  it("says a placement by the bills was auto-located and that HR changes it in the ERP",async()=>{
    actions.fetch.mockResolvedValue({ok:true,data:{...structuredClone(snapshot),history:{
      asOf:"2026-10-03T00:00:00Z",provisional:true as const,unassignedOrders:0,unassignedSales:0,
      championship:{status:"pending" as const,reason:"Pending."},
      events:[{id:"f1|AKEMI",fairId:"f1",brand:"AKEMI",week:"2026-09-11",closesOn:"2026-09-20",locked:true,venue:"MID VALLEY",start:"2026-09-11",end:"2026-09-13",periodMonth:"2026-09",people:[
        {id:"real-employee",name:"Actual Employee",sales:4000,held:0,orders:1,source:"auto"}]}]}}});
    render(<MemberArena membershipId={membershipId}/>);
    fireEvent.click(await screen.findByRole("button",{name:/Championship & Fair results/}));
    expect(screen.getByText("Auto-located · not on the ERP’s Sales Attending")).toBeInTheDocument();
    expect(screen.getByText(/1 of your fair finishes was auto-located: the ERP’s Sales Attending lists you at no booth that weekend/)).toBeInTheDocument();
    expect(screen.getByText(/HR changes it in the ERP/)).toBeInTheDocument();
  });
  it("says which tier the month reached and what it is worth, brand by brand",async()=>{
    render(<MemberArena membershipId={membershipId}/>);
    fireEvent.click(await screen.findByRole("button",{name:/Margin Incentive/}));
    expect(screen.getByRole("heading",{name:"Margin Incentive",level:1})).toBeInTheDocument();
    // 50% on Akemi clears both rungs, and they stack.
    expect(screen.getByText("Incentive Tier 2")).toBeInTheDocument();
    expect(screen.getByText("RM 2,500")).toBeInTheDocument();
    expect(screen.getByText("50.0%")).toBeInTheDocument();
  });
  it("holds the incentive on an uncosted brand instead of paying the rest",async()=>{
    actions.fetch.mockResolvedValue({ok:true,data:{...structuredClone(snapshot),people:[{...structuredClone(snapshot.people[0]),
      brands:{...structuredClone(snapshot.people[0].brands),ZANOTTI:{sales:900,held:0,orders:1,kpiQty:0,marginRevenue:0,marginCost:0,blindOrders:1}}}]}});
    render(<MemberArena membershipId={membershipId}/>);
    fireEvent.click(await screen.findByRole("button",{name:/Margin Incentive/}));
    expect(screen.getByText("Held, not lost")).toBeInTheDocument();
    expect(screen.getByText(/ZANOTTI bill has no cost yet/)).toBeInTheDocument();
    expect(screen.queryByText("RM 2,500")).not.toBeInTheDocument();
  });
});
