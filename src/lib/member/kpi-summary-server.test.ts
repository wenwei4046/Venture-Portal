import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadMemberKpiSummary, loadMemberTeamKpiSummary } from "./kpi-summary-server";
import { kpiLadderUnits, readKpiSummary, type MemberKpiSummary } from "./kpi-summary";

const mocks = vi.hoisted(() => ({ getUser: vi.fn(), createClient: vi.fn(), rpc: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth", () => ({ getMemberUser: mocks.getUser }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
const schemeId = "10000000-0000-4000-8000-000000000001";
const summary: MemberKpiSummary = {
  schemeId, period: "2026-09", asOf: "2026-09-16T00:00:00Z", enabled: true,
  items: [{ productCode: "PIL", label: "Configured pillow", quantity: 5 }, { productCode: "PRO", label: "Configured protector", quantity: 5 }],
  total: 10, threshold: 10, hit: true,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getUser.mockResolvedValue({ id: "signed-in-user", is_active: true, permissions: ["member_portal"] });
  mocks.createClient.mockResolvedValue({ rpc: mocks.rpc });
  mocks.rpc.mockResolvedValue({ data: summary, error: null });
});

// Insight › My team › a person (2026-11-03): a member reads the KPI items of somebody their My team lists — the
// database asks whether that person is under them (member_team_kpi_summary); the Principal goes through View as.
describe("a person under the member: their KPI items", () => {
  const staffId = "10000000-0000-4000-8000-000000000002";
  it("asks member_team_kpi_summary with the person, the scheme and the month — and projects as a member's own", async () => {
    mocks.getUser.mockResolvedValue({ id: "stanley", is_active: true, permissions: ["member_portal", "member_insight"] });
    mocks.rpc.mockResolvedValue({ data: { ...summary, teamView: true, viewedStaffId: staffId, salary: 777 }, error: null });
    expect(await loadMemberTeamKpiSummary(schemeId, staffId, "2026-09")).toEqual({ ok: true, data: summary });
    expect(mocks.rpc).toHaveBeenCalledWith("member_team_kpi_summary", { p_staff: staffId, p_scheme: schemeId, p_period: "2026-09" });
    await loadMemberTeamKpiSummary(schemeId, staffId);
    expect(mocks.rpc).toHaveBeenLastCalledWith("member_team_kpi_summary", { p_staff: staffId, p_scheme: schemeId, p_period: null });
  });
  it("asks nothing for an account without Insight, a Principal, or an id it cannot read", async () => {
    for (const user of [null, { is_active: true, permissions: ["member_portal"] }, { role: "principal", is_active: true, permissions: ["member_insight"] }]) {
      mocks.getUser.mockResolvedValue(user);
      expect((await loadMemberTeamKpiSummary(schemeId, staffId)).ok).toBe(false);
    }
    mocks.getUser.mockResolvedValue({ id: "stanley", is_active: true, permissions: ["member_portal", "member_insight"] });
    expect((await loadMemberTeamKpiSummary(schemeId, "james")).ok).toBe(false);
    expect((await loadMemberTeamKpiSummary(schemeId, staffId, "2026-9")).ok).toBe(false);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("a refusal (not under them) answers as a failed read", async () => {
    mocks.getUser.mockResolvedValue({ id: "stanley", is_active: true, permissions: ["member_portal", "member_insight"] });
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "This person is not in your team" } });
    expect((await loadMemberTeamKpiSummary(schemeId, staffId)).ok).toBe(false);
  });
});

describe("authenticated KPI summary boundary", () => {
  const context = { staffId: "10000000-0000-4000-8000-000000000002", subDepartmentId: "10000000-0000-4000-8000-000000000003" };
  it("uses a separate authenticated Principal RPC for an explicitly selected member", async () => {
    mocks.getUser.mockResolvedValue({ role: "revenue_member", actualRole: "principal", is_active: true, permissions: [] });
    expect(await loadMemberKpiSummary(schemeId, context)).toEqual({ ok: true, data: summary });
    expect(mocks.rpc).toHaveBeenCalledWith("member_principal_kpi_summary", { p_staff: context.staffId, p_scheme: schemeId });
  });
  it("rejects employee cross-member requests and Principal reads without a valid selection", async () => {
    expect((await loadMemberKpiSummary(schemeId, context)).ok).toBe(false);
    mocks.getUser.mockResolvedValue({ role: "principal", is_active: true, permissions: [] });
    expect((await loadMemberKpiSummary(schemeId)).ok).toBe(false);
    expect((await loadMemberKpiSummary(schemeId, { ...context, staffId: "bad" })).ok).toBe(false);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("uses the session RPC with only a scheme and projects away unrequested private fields", async () => {
    mocks.rpc.mockResolvedValue({ data: { ...summary, commission: 999, salary: 777, items: summary.items.map((item) => ({ ...item, unitCost: 80 })) }, error: null });
    expect(await loadMemberKpiSummary(schemeId)).toEqual({ ok: true, data: summary });
    expect(mocks.rpc).toHaveBeenCalledWith("member_kpi_summary", { p_scheme: schemeId });
  });

  it("requires active member-portal permission before reading KPI data", async () => {
    for (const user of [null, { is_active: false, permissions: ["member_portal"] }, { is_active: true, permissions: ["member_insight"] }]) {
      mocks.getUser.mockResolvedValue(user);
      expect(await loadMemberKpiSummary(schemeId)).toEqual({ ok: false, error: "Member portal access is required." });
    }
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("rejects malformed schemes and hides database errors without a demo fallback", async () => {
    expect((await loadMemberKpiSummary("fair-scheme")).ok).toBe(false);
    expect(mocks.rpc).not.toHaveBeenCalled();
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "permission denied for table private_payroll" } });
    expect(await loadMemberKpiSummary(schemeId)).toEqual({ ok: false, error: "KPI progress is temporarily unavailable. Please try again." });
    mocks.rpc.mockRejectedValue(new Error("SUPABASE_SERVICE_ROLE_KEY detail"));
    expect(await loadMemberKpiSummary(schemeId)).toEqual({ ok: false, error: "KPI progress is temporarily unavailable. Please try again." });
  });

  it("rejects mismatched, nonfinite, or contradictory payloads rather than declaring a false hit", () => {
    for (const value of [
      null, { ...summary, schemeId: "other" }, { ...summary, period: "2026-99" },
      { ...summary, total: Number.NaN }, { ...summary, total: 99 }, { ...summary, hit: false },
      { ...summary, threshold: -1 }, { ...summary, enabled: false },
      { ...summary, items: [{ ...summary.items[0], quantity: Number.POSITIVE_INFINITY }] },
      { ...summary, items: [summary.items[0], summary.items[0]] },
    ]) expect(readKpiSummary(value, schemeId)).toBeNull();
  });

  it("preserves a genuine zero, configurable threshold and an unavailable threshold", () => {
    expect(readKpiSummary({ ...summary, items: [], total: 0, hit: false }, schemeId)).toMatchObject({ total: 0, hit: false });
    expect(readKpiSummary({ ...summary, threshold: 12, hit: false }, schemeId)).toMatchObject({ total: 10, threshold: 12, hit: false });
    expect(readKpiSummary({ ...summary, threshold: null, hit: null }, schemeId)).toMatchObject({ total: 10, threshold: null, hit: null });
    expect(readKpiSummary({ ...summary, enabled: false, items: [], total: 0, threshold: null, hit: null }, schemeId)).toMatchObject({ enabled: false, total: 0, hit: null });
  });

  // 2026-11-12 — a brand on its own commission scheme (2990s) has KPI items of its own: counted whatever the
  // sub-department's KPI switch says, and no part of its ladder (mig 20261114020000).
  describe("a brand's own items", () => {
    const own = { productCode: "AK-PILLOW", label: "AKEMI PILLOW", quantity: 3 };
    const fabric = { productCode: "2990S · Sofa Full Fabric", label: "Upgrade fabric", quantity: 0.5, brand: "2990S" };
    const latex = { productCode: "2990S · Latex Seat", label: "Upgrade latex seat", quantity: 1, brand: "2990S" };
    const base = { schemeId, period: "2026-11", asOf: "2026-11-12T08:00:00Z", enabled: true };

    it("reads the brand's items alone while the sub-department's KPI is off: no ladder, no threshold", () => {
      const read = readKpiSummary({ ...base, items: [fabric, latex], total: 1.5, ladderTotal: 0, threshold: null, hit: null }, schemeId);
      expect(read).toEqual({ ...base, items: [fabric, latex], total: 1.5, ladderTotal: 0, threshold: null, hit: null });
      expect(kpiLadderUnits(read!)).toBe(0);
    });

    it("reads the threshold against the sub-department's own units, never a brand's", () => {
      // 4.5 units in all, three of them its own: a ladder of four is not reached — and of three, is.
      const all = { ...base, items: [own, fabric, latex], total: 4.5, ladderTotal: 3 };
      expect(readKpiSummary({ ...all, threshold: 4, hit: false }, schemeId)).toMatchObject({ total: 4.5, ladderTotal: 3, hit: false });
      expect(readKpiSummary({ ...all, threshold: 3, hit: true }, schemeId)).toMatchObject({ hit: true });
      // What the total alone would say is refused.
      expect(readKpiSummary({ ...all, threshold: 4, hit: true }, schemeId)).toBeNull();
    });

    it("refuses a ladder that is not its own items' units, and a brand that is no name", () => {
      expect(readKpiSummary({ ...base, items: [own, fabric], total: 3.5, ladderTotal: 3.5, threshold: null, hit: null }, schemeId)).toBeNull();
      expect(readKpiSummary({ ...base, items: [own, fabric], total: 3.5, ladderTotal: Number.NaN, threshold: null, hit: null }, schemeId)).toBeNull();
      expect(readKpiSummary({ ...base, items: [{ ...fabric, brand: " " }], total: 0.5, ladderTotal: 0, threshold: null, hit: null }, schemeId)).toBeNull();
      expect(readKpiSummary({ ...base, items: [{ ...fabric, brand: 2990 }], total: 0.5, ladderTotal: 0, threshold: null, hit: null }, schemeId)).toBeNull();
    });

    it("an answer from before the change reads as it did: the total is the ladder", () => {
      const before = readKpiSummary(summary, schemeId)!;
      expect(before).not.toHaveProperty("ladderTotal");
      expect(kpiLadderUnits(before)).toBe(before.total);
    });
  });
});
