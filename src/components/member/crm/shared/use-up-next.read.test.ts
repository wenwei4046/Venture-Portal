/**
 * The owner, 2026-11-09: "up next 电脑 & 手机版的载入时间还是很慢". Up next is asked of the database straight from the browser
 * (the Server Actions run one at a time, behind the CRM's own read every 5 s), the Server Action only when that fails.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
const fetchUpNext = vi.fn(async (_a: unknown) => ({ ok: true as const, read: { from: "action" } }));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({ rpc }) }));
vi.mock("@/app/(member)/member/crm-actions", () => ({ fetchUpNext: (a: unknown) => fetchUpNext(a), crmWrite: vi.fn() }));

import { readUpNext } from "./use-up-next";

beforeEach(() => { rpc.mockReset(); fetchUpNext.mockClear(); });

describe("Up next is read without waiting behind the CRM's Server Actions", () => {
  it("asks crm_up_next from the browser, with the screen's arguments", async () => {
    rpc.mockResolvedValue({ data: { from: "browser" }, error: null });
    const r = await readUpNext({ ad: "all", ads: ["A1"], line: null });
    expect(rpc).toHaveBeenCalledWith("crm_up_next", { p_ad: "all", p_ads: ["A1"], p_n: 10, p_line: null });
    expect(r).toEqual({ ok: true, read: { from: "browser" } });
    expect(fetchUpNext).not.toHaveBeenCalled();
  });
  it("falls back to the Server Action when the browser's read fails", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "nope" } });
    const r = await readUpNext({ ad: "A1", ads: null, line: "L" });
    expect(fetchUpNext).toHaveBeenCalledWith({ ad: "A1", ads: null, line: "L" });
    expect(r).toEqual({ ok: true, read: { from: "action" } });
  });
});
