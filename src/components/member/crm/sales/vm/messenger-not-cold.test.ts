/**
 * The owner, 2026-10-30: "Messenger 客户先不要去 cold lead，等 human agent 回复后再恢复" — a Messenger chat past 24 h stays
 * out of Cold leads until HUMAN_AGENT_APPROVED; WhatsApp's stays as it was.
 */
import { describe, expect, it } from "vitest";
import type { CrmCustomer } from "@/lib/member/crm-data";
import { isCold } from "./common";

const now = new Date("2026-10-30T12:00:00Z");
const chat = (channel: "messenger" | "whatsapp") => ({ id: "c", name: "A", phone: "", channel, status: "follow_up", lastCustomerAt: "2026-10-28T09:00:00Z",
  createdAt: "2026-10-28T09:00:00Z", unread: 0, details: {}, messages: [{ id: "m", from: "them", text: "hi", at: "2026-10-28T09:00:00Z" }] }) as unknown as CrmCustomer;

describe("Cold leads and Messenger before Human Agent", () => {
  it("a Messenger chat past 24 h is not cold until Human Agent is approved", () => {
    expect(isCold(chat("messenger"), now, false)).toBe(false);
  });
  it("WhatsApp past 24 h is still cold", () => expect(isCold(chat("whatsapp"), now, false)).toBe(true));
});
