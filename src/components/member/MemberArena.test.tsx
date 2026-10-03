import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MemberArenaSnapshot } from "@/lib/member/arena";
import MemberArena from "./MemberArena";

const actions = vi.hoisted(() => ({ fetch: vi.fn(), save: vi.fn(), savePrincipal: vi.fn() }));
vi.mock("@/app/(member)/member/arena-actions", () => ({ fetchMemberArena: actions.fetch, saveMemberArenaBrandWeeks: actions.save, savePrincipalArenaBrandWeeks: actions.savePrincipal }));
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
beforeEach(()=>{actions.fetch.mockReset().mockResolvedValue({ok:true,data:structuredClone(snapshot)});actions.save.mockReset().mockResolvedValue({ok:true});actions.savePrincipal.mockReset().mockResolvedValue({ok:true});});
afterEach(cleanup);
describe("Live Member Arena",()=>{
  // The Principal's view of a member is the back office for brand weeks
  // (user 2026-10-03: after 一个星期后就不能再改了，除非 … 后台这边改): any week,
  // closed ones too, saved for that member — never as them.
  it("shows selected Principal results and lets the back office change the member's weeks, closed ones too",async()=>{
    const context={staffId:"real-employee",subDepartmentId:membershipId};
    actions.fetch.mockResolvedValue({ok:true,data:{...structuredClone(snapshot),principalView:true,selfId:"",viewedStaffId:context.staffId,weekLocks,
      people:snapshot.people.map(person=>({...person,self:false})),brandWeeks:{weeks:4,counts:{AKEMI:3,ERGOTEX:0,ZANOTTI:1,DUNLOP:0},
        picks:{"2026-09-04":"AKEMI","2026-09-11":"AKEMI","2026-09-18":"ZANOTTI","2026-09-25":"AKEMI"}}}});
    render(<MemberArena membershipId={membershipId} context={context}/>);
    fireEvent.click(await screen.findByRole("button",{name:/Sales Ranking/}));
    expect(actions.fetch).toHaveBeenCalledWith(membershipId,expect.any(String),"monthly",context);
    expect(screen.getByText("Actual Employee · Result")).toBeInTheDocument();
    expect(screen.queryByText("You")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button",{name:"Arena"}));
    fireEvent.click(screen.getByRole("button",{name:/Member brand weeks/}));
    expect(screen.getByText(/Back office · any week can be changed here, closed ones too/)).toBeInTheDocument();
    expect(screen.getByText("4 of 4 weeks picked")).toBeInTheDocument();
    const weeks=screen.getAllByRole("combobox",{name:/Brand for week/});
    // The third weekend of September was Zanotti, and it closed on 27 Sep — still the back office's to change.
    expect(weeks[2]).toHaveValue("ZANOTTI");
    expect(screen.getByText("Weekend of 18–20 Sep").closest("label")).toHaveTextContent("Closed 27 Sep");
    expect(weeks.every(week=>!(week as HTMLSelectElement).disabled)).toBe(true);
    fireEvent.change(weeks[2],{target:{value:"AKEMI"}});
    fireEvent.click(screen.getByRole("button",{name:"Save brand weeks"}));
    await waitFor(()=>expect(screen.getByRole("status",{name:"Brand weeks save status"})).toHaveTextContent("Actual Employee’s brand weeks are saved."));
    expect(actions.savePrincipal).toHaveBeenCalledWith(membershipId,snapshot.period,
      {"2026-09-04":"AKEMI","2026-09-11":"AKEMI","2026-09-18":"AKEMI","2026-09-25":"AKEMI"},context);
    expect(actions.save).not.toHaveBeenCalled();
  });

  it("keeps a member's closed weeks as they are, says what each was auto-located at, and leaves the open week to pick",async()=>{
    actions.fetch.mockResolvedValue({ok:true,data:{...structuredClone(snapshot),weekLocks,
      brandWeeks:{weeks:4,counts:{AKEMI:1,ERGOTEX:0,ZANOTTI:0,DUNLOP:0},picks:{"2026-09-04":"AKEMI"}},
      history:{asOf:"2026-10-03T00:00:00Z",provisional:true as const,unassignedOrders:0,unassignedSales:0,
        championship:{status:"pending" as const,reason:"Pending."},
        events:[{id:"f2|ZANOTTI",brand:"ZANOTTI",week:"2026-09-18",closesOn:"2026-09-27",locked:true,venue:"MVEC SOUTHKEY",start:"2026-09-18",end:"2026-09-20",periodMonth:"2026-09",
          people:[{id:"real-employee",name:"Actual Employee",sales:4000,held:0,orders:1,confirmed:false}]}]}}});
    render(<MemberArena membershipId={membershipId}/>);
    fireEvent.click(await screen.findByRole("button",{name:/My brand weeks/}));
    const weeks=screen.getAllByRole("combobox",{name:/Brand for week/}) as HTMLSelectElement[];
    expect(weeks.map(week=>week.disabled)).toEqual([true,true,true,false]);
    expect(screen.getByText("Weekend of 4–6 Sep").closest("label")).toHaveTextContent("Closed 13 Sep");
    expect(screen.getByText("Weekend of 11–13 Sep").closest("label")).toHaveTextContent("Closed 20 Sep · not picked");
    expect(screen.getByText("Weekend of 18–20 Sep").closest("label")).toHaveTextContent("Closed 27 Sep · auto-located: ZANOTTI");
    expect(screen.getByText("Weekend of 25–27 Sep").closest("label")).toHaveTextContent("Open until 6 Oct");
    fireEvent.change(weeks[3],{target:{value:"DUNLOP"}});
    fireEvent.click(screen.getByRole("button",{name:"Save brand weeks"}));
    await waitFor(()=>expect(actions.save).toHaveBeenCalledWith(membershipId,snapshot.period,{"2026-09-04":"AKEMI","2026-09-25":"DUNLOP"}));
    expect(actions.savePrincipal).not.toHaveBeenCalled();
  });

  it("offers no save once every week of the month has closed",async()=>{
    actions.fetch.mockResolvedValue({ok:true,data:{...structuredClone(snapshot),weekLocks:weekLocks.map(lock=>({...lock,locked:true}))}});
    render(<MemberArena membershipId={membershipId}/>);
    fireEvent.click(await screen.findByRole("button",{name:/My brand weeks/}));
    expect(screen.queryByRole("button",{name:"Save brand weeks"})).not.toBeInTheDocument();
    expect(screen.getByText(/Every week of this month has closed/)).toBeInTheDocument();
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
  // One brand per week (2026-10-03): the Fair results rank the member at that
  // brand's booth that week.
  it("picks a brand for each week and only confirms after authenticated persistence succeeds",async()=>{
    render(<MemberArena membershipId={membershipId}/>);
    expect(await screen.findByRole("button",{name:/My brand weeks/})).toHaveTextContent("0 of 4 weeks picked");
    fireEvent.click(screen.getByRole("button",{name:/My brand weeks/}));
    const weeks=screen.getAllByRole("combobox",{name:/Brand for week/});
    expect(weeks).toHaveLength(4);
    expect(screen.getByText("Weekend of 4–6 Sep")).toBeInTheDocument();
    expect(screen.getByText(/0 of 4 weeks picked · A week not picked counts the booth with the most bills/)).toBeInTheDocument();
    fireEvent.change(weeks[0],{target:{value:"AKEMI"}});
    fireEvent.change(weeks[2],{target:{value:"ZANOTTI"}});
    fireEvent.change(weeks[3],{target:{value:"DUNLOP"}});
    fireEvent.change(weeks[3],{target:{value:""}});
    expect(screen.getByText(/2 of 4 weeks picked/)).toBeInTheDocument();
    const save=screen.getByRole("button",{name:"Save brand weeks"});
    actions.save.mockResolvedValueOnce({ok:false,error:"Save failed. Try again."});
    fireEvent.click(save);
    expect(await screen.findByRole("status",{name:"Brand weeks save status"})).toHaveTextContent("Save failed");
    expect(actions.save).toHaveBeenCalledWith(membershipId,snapshot.period,{"2026-09-04":"AKEMI","2026-09-18":"ZANOTTI","2026-09-25":undefined});
    // Saved: the page reads the Arena again — the weeks move the Fair results — without blanking.
    const reads=actions.fetch.mock.calls.length;
    actions.fetch.mockResolvedValue({ok:true,data:{...structuredClone(snapshot),
      brandWeeks:{weeks:4,counts:{AKEMI:1,ERGOTEX:0,ZANOTTI:1,DUNLOP:0},picks:{"2026-09-04":"AKEMI","2026-09-18":"ZANOTTI"}}}});
    fireEvent.click(save);
    await waitFor(()=>expect(screen.getByRole("status",{name:"Brand weeks save status"})).toHaveTextContent("Your brand weeks are saved."));
    await waitFor(()=>expect(actions.fetch.mock.calls.length).toBe(reads+1));
    expect(screen.queryByText("Loading your rankings…")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button",{name:"Arena"}));
    expect(screen.getByRole("button",{name:/My brand weeks/})).toHaveTextContent("2 of 4 weeks picked");
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
          {id:"real-employee",name:"Actual Employee",sales:4000,held:0,orders:1,confirmed:false,scoring:true}]},
        {id:"f1|ZANOTTI",fairId:"f1",brand:"ZANOTTI",week:"2026-09-11",venue:"MID VALLEY",start:"2026-09-11",end:"2026-09-13",periodMonth:"2026-09",people:[
          {id:"colleague",name:"Other Employee",sales:8000,held:0,orders:1,confirmed:true,scoring:true},
          // Sold more at Zanotti than its own seller, but it is not this week's scoring booth.
          {id:"real-employee",name:"Actual Employee",sales:9000,held:0,orders:1,confirmed:false,scoring:false}]}]}}});
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
    expect(screen.getByText("Unconfirmed · pick the brand week")).toBeInTheDocument();
    expect(screen.getByText(/1 of your fair finishes is placed by the booth with the most bills that week/)).toBeInTheDocument();
    expect(screen.getByText(/RM 13,588 over 3 bills were written at another booth than the seller’s brand week.*earn no points there/)).toBeInTheDocument();
    // The record is the scoring booth's 4,000, not the 9,000 off the brand week.
    expect(screen.getByText(/^AKEMI · MID VALLEY · 11 Sept? – 13 Sept?$/)).toBeInTheDocument();
  });
  // Seven days after the fair nobody can pick any more (user 2026-10-03): a
  // guess is auto-located, and the page says so, and who can still change it.
  it("says a closed week's guess was auto-located and only the back office changes it",async()=>{
    actions.fetch.mockResolvedValue({ok:true,data:{...structuredClone(snapshot),history:{
      asOf:"2026-10-03T00:00:00Z",provisional:true as const,unassignedOrders:0,unassignedSales:0,
      championship:{status:"pending" as const,reason:"Pending."},
      events:[{id:"f1|AKEMI",fairId:"f1",brand:"AKEMI",week:"2026-09-11",closesOn:"2026-09-20",locked:true,venue:"MID VALLEY",start:"2026-09-11",end:"2026-09-13",periodMonth:"2026-09",people:[
        {id:"real-employee",name:"Actual Employee",sales:4000,held:0,orders:1,confirmed:false}]}]}}});
    render(<MemberArena membershipId={membershipId}/>);
    fireEvent.click(await screen.findByRole("button",{name:/Championship & Fair results/}));
    expect(screen.getByText(/^Auto-located · the brand week closed on 20 Sept?$/)).toBeInTheDocument();
    expect(screen.queryByText(/^Unconfirmed/)).not.toBeInTheDocument();
    expect(screen.getByText(/1 of your fair finishes was auto-located: no brand was picked before the week closed/)).toBeInTheDocument();
    expect(screen.getByText(/Only the back office can change it now/)).toBeInTheDocument();
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
