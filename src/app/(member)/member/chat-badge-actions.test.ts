/**
 * The CRM badge counts one's OWN chats only — whoever sees everybody's CRM too (the owner, 2026-10-16: a customer
 * writing to PETER's chat is PETER's to be told of, not the Principal's).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn(), from = vi.fn();
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ rpc, from }) }));
vi.mock("@/lib/auth", () => ({ getMemberUser: async () => ({ is_active: true }), getAccountUser: async () => ({ is_active: true }) }));
vi.mock("@/lib/permission-actions", () => ({ canDo: () => true })); // View at All, as the Principal

import { fetchMemberCrmUnread } from "./chat-badge-actions";

describe("the CRM badge", () => {
  beforeEach(() => { rpc.mockReset(); from.mockReset(); });
  it("is one's own chats' unread even for an account that sees everybody's CRM", async () => {
    rpc.mockResolvedValue({ data: 0, error: null });
    expect(await fetchMemberCrmUnread()).toEqual({ ok: true, data: 0 });
    expect(rpc).toHaveBeenCalledWith("crm_my_unread");
    expect(from).not.toHaveBeenCalled();
  });
});
