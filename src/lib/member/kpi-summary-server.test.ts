import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadMemberKpiSummary } from "./kpi-summary-server";
import { readKpiSummary, type MemberKpiSummary } from "./kpi-summary";

const mocks = vi.hoisted(() => ({ getUser: vi.fn(), createClient: vi.fn(), rpc: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth", () => ({ getUser: mocks.getUser }));
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

describe("authenticated KPI summary boundary", () => {
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
});
