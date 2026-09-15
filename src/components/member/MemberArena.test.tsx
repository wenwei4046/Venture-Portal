import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MemberArenaSnapshot } from "@/lib/member/arena";
import MemberArena from "./MemberArena";

const actions = vi.hoisted(() => ({ fetch: vi.fn(), save: vi.fn() }));
vi.mock("@/app/(member)/member/arena-actions", () => ({ fetchMemberArena: actions.fetch, saveMemberArenaBrandWeeks: actions.save }));
const membershipId="10000000-0000-4000-8000-000000000001";
const snapshot: MemberArenaSnapshot={membershipId,department:"Fair",selfId:"real-employee",period:"2026-09",window:"monthly",from:"2026-09-01",through:"2026-09-16",asOf:"2026-09-16T00:00:00Z",live:true,
  brands:[{code:"AKEMI",name:"Akemi"}],brandWeeks:null,people:[
    {id:"real-employee",name:"Actual Employee",self:true,sales:4000,held:0,orders:1,kpiQty:3,marginRevenue:4000,marginCost:2000,blindOrders:0,brands:{AKEMI:{sales:4000,held:0,orders:1,kpiQty:3,marginRevenue:4000,marginCost:2000,blindOrders:0}}},
    {id:"colleague",name:"Other Employee",self:false,sales:8000,held:0,orders:1,kpiQty:2,marginRevenue:8000,marginCost:6000,blindOrders:0,brands:{}},
  ]};
beforeEach(()=>{actions.fetch.mockReset().mockResolvedValue({ok:true,data:structuredClone(snapshot)});actions.save.mockReset().mockResolvedValue({ok:true});});
afterEach(cleanup);
describe("Live Member Arena",()=>{
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
  it("only confirms brand weeks after authenticated persistence succeeds",async()=>{
    render(<MemberArena membershipId={membershipId}/>);
    fireEvent.click(await screen.findByRole("button",{name:/My brand weeks/}));
    const save=screen.getByRole("button",{name:"Save brand weeks"});
    expect(save).toBeDisabled();
    for(let i=0;i<3;i++)fireEvent.click(screen.getByRole("button",{name:"Add one week to Akemi"}));
    fireEvent.click(screen.getByRole("button",{name:"Add one week to Zanotti"}));
    actions.save.mockResolvedValueOnce({ok:false,error:"Save failed. Try again."});
    fireEvent.click(save);
    expect(await screen.findByRole("status",{name:"Brand weeks save status"})).toHaveTextContent("Save failed");
    expect(actions.save).toHaveBeenCalledWith(membershipId,snapshot.period,{weeks:4,counts:{AKEMI:3,ERGOTEX:0,ZANOTTI:1,DUNLOP:0}});
    fireEvent.click(save);
    await waitFor(()=>expect(screen.getByRole("status",{name:"Brand weeks save status"})).toHaveTextContent("Your brand weeks are saved."));
  });
  it("keeps deferred Fair and Championship information explicit without manufacturing points",async()=>{
    render(<MemberArena membershipId={membershipId}/>);
    fireEvent.click(await screen.findByRole("button",{name:/Championship & Fair results/}));
    expect(screen.getByRole("heading",{name:"Fair history is not connected yet"})).toBeInTheDocument();
    expect(screen.getByText(/Championship totals will appear/)).toBeInTheDocument();
    expect(screen.queryByText(/\d+\s*pts/)).not.toBeInTheDocument();
  });
});
