import { describe, expect, it } from "vitest";
import type { CrmCustomer } from "@/lib/member/crm-data";
import { isNewChat } from "./inbox";

const cust = (p: Partial<CrmCustomer>) => ({ createdAt: "2026-10-13T01:00:00Z", assignedAt: null, messages: [], ...p }) as unknown as CrmCustomer;

describe("the Team inbox's New", () => {
  it("is an enquiry nobody of ours has answered since it came", () => {
    expect(isNewChat(cust({ messages: [{ from: "lead", at: "2026-10-13T01:00:00Z" }] as CrmCustomer["messages"] }))).toBe(true);
    expect(isNewChat(cust({ messages: [{ from: "me", at: "2026-10-13T01:05:00Z" }] as CrmCustomer["messages"] }))).toBe(false);
  });
  it("an auto-reply is not an answer", () => {
    expect(isNewChat(cust({ messages: [{ from: "me", auto: true, at: "2026-10-13T01:01:00Z" }] as CrmCustomer["messages"] }))).toBe(true);
  });
  it("one handed to somebody new is New until they answer", () => {
    const msgs = [{ from: "me", at: "2026-10-13T01:05:00Z" }] as CrmCustomer["messages"];
    expect(isNewChat(cust({ assignedAt: "2026-10-13T02:00:00Z", messages: msgs }))).toBe(true);
    expect(isNewChat(cust({ assignedAt: "2026-10-13T02:00:00Z", messages: [...msgs, { from: "me", at: "2026-10-13T02:10:00Z" }] as CrmCustomer["messages"] }))).toBe(false);
  });
});
