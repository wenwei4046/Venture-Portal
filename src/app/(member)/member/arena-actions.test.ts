import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchMemberArena, saveMemberArenaBrandWeeks, savePrincipalArenaBrandWeeks } from "./arena-actions";

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
    expect((await saveMemberArenaBrandWeeks(membershipId,"2026-09",{"2026-09-04":"AKEMI"})).ok).toBe(false);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  // Booth by booth (2026-10-03): the Fair results come from the booth read, and
  // a member saves which brand each week was.
  it("reads the Fair results booth by booth, for the member and for a Principal",async()=>{
    await fetchMemberArena(membershipId,"2026-09","monthly");
    expect(mocks.rpc).toHaveBeenCalledWith("member_arena_booth_history",{p_sub_department:membershipId});
    mocks.rpc.mockClear();
    mocks.getUser.mockResolvedValue({role:"revenue_member",actualRole:"principal",is_active:true,permissions:[]});
    await fetchMemberArena(membershipId,"2026-09","monthly",context);
    expect(mocks.rpc).toHaveBeenCalledWith("member_principal_arena_booth_history",{p_staff:context.staffId,p_sub_department:membershipId});
  });
  it("saves the picked weeks only, and refuses a week or brand the month does not have",async()=>{
    mocks.rpc.mockResolvedValue({data:null,error:null});
    expect((await saveMemberArenaBrandWeeks(membershipId,"2026-09",{"2026-09-04":"AKEMI","2026-09-11":undefined,"2026-09-25":"DUNLOP"})).ok).toBe(true);
    expect(mocks.rpc).toHaveBeenCalledWith("member_arena_save_brand_week_picks",{p_sub_department:membershipId,p_period:"2026-09",p_picks:{"2026-09-04":"AKEMI","2026-09-25":"DUNLOP"}});
    mocks.rpc.mockClear();
    expect((await saveMemberArenaBrandWeeks(membershipId,"2026-09",{"2026-09-05":"AKEMI"})).ok).toBe(false);
    expect((await saveMemberArenaBrandWeeks(membershipId,"2026-09",{"2026-09-04":"MYLATEX" as never})).ok).toBe(false);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  // After a week closes only the back office changes it (user 2026-10-03):
  // the Principal, for the member they are viewing.
  it("lets the back office set a member's weeks, and nobody else",async()=>{
    mocks.rpc.mockResolvedValue({data:null,error:null});
    expect((await savePrincipalArenaBrandWeeks(membershipId,"2026-09",{"2026-09-04":"ZANOTTI"},context)).ok).toBe(false);
    expect(mocks.rpc).not.toHaveBeenCalled();
    mocks.getUser.mockResolvedValue({role:"revenue_member",actualRole:"principal",is_active:true,permissions:[]});
    expect((await savePrincipalArenaBrandWeeks(membershipId,"2026-09",{"2026-09-04":"ZANOTTI","2026-09-11":undefined},context)).ok).toBe(true);
    expect(mocks.rpc).toHaveBeenCalledWith("member_principal_save_brand_week_picks",{p_staff:context.staffId,p_sub_department:membershipId,p_period:"2026-09",p_picks:{"2026-09-04":"ZANOTTI"}});
    mocks.rpc.mockClear();
    expect((await savePrincipalArenaBrandWeeks(membershipId,"2026-09",{"2026-09-04":"ZANOTTI"},{...context,subDepartmentId:context.staffId})).ok).toBe(false);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
