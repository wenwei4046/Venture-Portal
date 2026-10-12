import { beforeEach, describe, expect, it, vi } from "vitest";
import * as arenaActions from "./arena-actions";

const { fetchMemberArena } = arenaActions;

const mocks=vi.hoisted(()=>({getUser:vi.fn(),createClient:vi.fn(),rpc:vi.fn()}));
vi.mock("server-only",()=>({}));
vi.mock("@/lib/auth",()=>({getMemberUser:mocks.getUser}));
vi.mock("@/lib/supabase/server",()=>({createClient:mocks.createClient}));
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
  // Brand weeks come from the ERP's Sales Attending (2026-10-12): nobody — the
  // member, the Principal viewing them — has a way to save one any more.
  it("offers no brand-week save",()=>{
    expect(Object.keys(arenaActions).sort()).toEqual(["fetchMemberArena"]);
  });
});
