import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchMemberArena, saveMemberArenaBrandWeeks } from "./arena-actions";

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
  it("never lets Principal save another member's brand weeks",async()=>{
    mocks.getUser.mockResolvedValue({role:"principal",is_active:true,permissions:["member_insight"]});
    expect((await saveMemberArenaBrandWeeks(membershipId,"2026-09",{weeks:4,counts:{AKEMI:4,ERGOTEX:0,ZANOTTI:0,DUNLOP:0}})).ok).toBe(false);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
