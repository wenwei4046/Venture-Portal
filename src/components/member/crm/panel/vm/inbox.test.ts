import { describe, expect, it } from "vitest";
import type { CrmCustomer } from "@/lib/member/crm-data";
import { contactsVM, isNewChat } from "./inbox";
import type { PanelCtx } from "./common";

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

describe("the Team side's Contacts search reads the whole chat (the owner, 2026-10-28: Team 那边的 inbox 也加上)", () => {
  const ctxWith = (q: string) => ({
    ui: { pcQ: q, pcOpen: true }, set: () => {}, now: new Date("2026-10-27T04:00:00Z"), directors: [], teamOfStaff: () => null, nameOf: () => "ANNA",
    data: { can: { manage: false }, customers: [
      cust({ id: "wah", name: "Wah Leong", assignedTo: "anna", status: "follow_up", phone: "60123", messages: [{ id: "1", from: "lead", kind: "text", text: "钥匙还没有拿回", at: "2026-10-25T01:00:00Z" }, { id: "2", from: "me", kind: "text", text: "好的", at: "2026-10-25T02:00:00Z" }] as CrmCustomer["messages"] }),
      cust({ id: "vivi", name: "vivi", assignedTo: "anna", status: "follow_up", phone: "60124", messages: [{ id: "3", from: "lead", kind: "text", text: "空空", at: "2026-10-26T01:00:00Z" }] as CrmCustomer["messages"] }),
    ] },
  }) as unknown as PanelCtx;
  it("an earlier message's words find the customer; a name still does", () => {
    expect(contactsVM(ctxWith("钥匙")).pcRows.map(r => r.name)).toEqual(["Wah Leong"]);
    expect(contactsVM(ctxWith("vivi")).pcRows.map(r => r.name)).toEqual(["vivi"]);
  });
});
