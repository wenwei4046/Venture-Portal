import { beforeEach, describe, expect, it, vi } from "vitest";
import * as arenaActions from "./arena-actions";

const { fetchMemberArena } = arenaActions;

const mocks=vi.hoisted(()=>({getUser:vi.fn(),createClient:vi.fn(),rpc:vi.fn()}));
vi.mock("server-only",()=>({}));
vi.mock("@/lib/auth",()=>({getMemberUser:mocks.getUser}));
vi.mock("@/lib/supabase/server",()=>({createClient:mocks.createClient}));
// Monday 12 Oct 2026 in the office: this week's fair weekend is 16–18 Oct.
vi.mock("@/lib/office-time",()=>({officeToday:()=>"2026-10-12"}));
const membershipId="10000000-0000-4000-8000-000000000001";
const context={staffId:"10000000-0000-4000-8000-000000000002",subDepartmentId:membershipId};
beforeEach(()=>{
  vi.clearAllMocks();
  mocks.getUser.mockResolvedValue({role:"revenue_member",is_active:true,permissions:["member_insight"]});
  mocks.createClient.mockResolvedValue({rpc:mocks.rpc});
  mocks.rpc.mockResolvedValue({data:{people:[]},error:null});
});
describe("Arena identity boundary",()=>{
  it("keeps employee reads on self-only RPC",async()=>{
    expect((await fetchMemberArena(membershipId,"2026-09","monthly")).ok).toBe(true);
    expect(mocks.rpc).toHaveBeenCalledWith("member_arena_snapshot",{p_sub_department:membershipId,p_period:"2026-09",p_window:"monthly"});
  });
  it("authorizes an actual Principal through a separate selected-member read RPC",async()=>{
    mocks.getUser.mockResolvedValue({role:"revenue_member",actualRole:"principal",is_active:true,permissions:[]});
    expect((await fetchMemberArena(membershipId,"2026-09","quarterly",context)).ok).toBe(true);
    expect(mocks.rpc).toHaveBeenCalledWith("member_principal_arena_snapshot",{p_staff:context.staffId,p_sub_department:membershipId,p_period:"2026-09",p_window:"quarterly"});
  });
  it("refuses employee cross-member access and mismatched department context",async()=>{
    expect((await fetchMemberArena(membershipId,"2026-09","monthly",context)).ok).toBe(false);
    mocks.getUser.mockResolvedValue({role:"principal",is_active:true,permissions:[]});
    expect((await fetchMemberArena(membershipId,"2026-09","monthly")).ok).toBe(false);
    expect((await fetchMemberArena(membershipId,"2026-09","monthly",{...context,subDepartmentId:context.staffId})).ok).toBe(false);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  // Booth by booth (2026-10-03): the Fair results come from the booth read —
  // since 2026-10-12 with the person's brand weeks, which come from the ERP.
  it("reads the Fair results booth by booth, for the member and for a Principal",async()=>{
    await fetchMemberArena(membershipId,"2026-09","monthly");
    expect(mocks.rpc).toHaveBeenCalledWith("member_arena_booth_history",{p_sub_department:membershipId});
    mocks.rpc.mockClear();
    mocks.getUser.mockResolvedValue({role:"revenue_member",actualRole:"principal",is_active:true,permissions:[]});
    await fetchMemberArena(membershipId,"2026-09","monthly",context);
    expect(mocks.rpc).toHaveBeenCalledWith("member_principal_arena_booth_history",{p_staff:context.staffId,p_sub_department:membershipId});
  });
  // The user, 2026-10-12: "they only view their current and previous assign, but not future" —
  // a later weekend the ERP already lists them at never reaches the phone, for the member or the
  // Principal viewing them.
  it("hands over this week's brand week and the ones before it, never a later weekend",async()=>{
    const week=(friday:string)=>({staffId:context.staffId,week:friday,source:"erp",brand:"AKEMI",fairId:null,venue:"MID VALLEY",organizer:"BIGHOME",start:friday,end:friday,booths:1});
    const weeks=["2026-10-09","2026-10-16","2026-10-23","2026-10-30"].map(week);
    mocks.rpc.mockImplementation(async(name:string)=>/booth_history$/.test(name)
      ?{data:{events:[],weeks},error:null}:{data:{people:[]},error:null});
    const member=await fetchMemberArena(membershipId,"2026-10","monthly");
    expect(member.ok&&member.data.history?.weeks?.map(w=>w.week)).toEqual(["2026-10-09","2026-10-16"]);
    mocks.getUser.mockResolvedValue({role:"revenue_member",actualRole:"principal",is_active:true,permissions:[]});
    const viewing=await fetchMemberArena(membershipId,"2026-10","monthly",context);
    expect(viewing.ok&&viewing.data.history?.weeks?.map(w=>w.week)).toEqual(["2026-10-09","2026-10-16"]);
  });
  // Brand weeks come from the ERP's Sales Attending (2026-10-12): nobody — the
  // member, the Principal viewing them — has a way to save one any more.
  // The Principal viewing nobody (2026-10-25 — "Arena 那边 … 显示 Top 3 是谁"): the whole sub-department's boards and every
  // booth, for a Principal account alone.
  it("reads the whole sub-department's boards for a Principal, and for nobody else",async()=>{
    mocks.getUser.mockResolvedValue({role:"revenue_member",actualRole:"principal",is_active:true,permissions:[]});
    mocks.rpc.mockImplementation(async(name:string)=>/booth_history$/.test(name)?{data:{events:[],weeks:[]},error:null}:{data:{people:[]},error:null});
    const read=await arenaActions.fetchDepartmentArena(membershipId,"2026-10","monthly");
    expect(read.ok).toBe(true);
    expect(mocks.rpc).toHaveBeenCalledWith("member_principal_department_arena",{p_sub_department:membershipId,p_period:"2026-10",p_window:"monthly"});
    expect(mocks.rpc).toHaveBeenCalledWith("member_principal_department_booth_history",{p_sub_department:membershipId});
    mocks.rpc.mockClear();
    await arenaActions.fetchDepartmentArena(membershipId,"2026-10","annual",{history:false});
    expect(mocks.rpc.mock.calls.map(c=>c[0])).toEqual(["member_principal_department_arena"]);
    mocks.rpc.mockClear();
    mocks.getUser.mockResolvedValue({role:"revenue_member",is_active:true,permissions:["member_insight"]});
    expect((await arenaActions.fetchDepartmentArena(membershipId,"2026-10","monthly")).ok).toBe(false);
    expect((await arenaActions.fetchDepartmentArena("fair","2026-10","monthly")).ok).toBe(false);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  // …and since 2026-10-25 the Principal viewing nobody reads the whole sub-department's boards, still nothing to save.
  it("offers no brand-week save",()=>{
    expect(Object.keys(arenaActions).sort()).toEqual(["fetchDepartmentArena", "fetchMemberArena"]);
  });
});
