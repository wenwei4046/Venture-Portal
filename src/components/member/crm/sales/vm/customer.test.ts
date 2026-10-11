import { describe, expect, it } from "vitest";
import type { CrmCustomer } from "@/lib/member/crm-data";
import { infoRows } from "./customer";

const at = (s: string) => new Date(s).toISOString();
const customer = (messages: CrmCustomer["messages"]): CrmCustomer => ({
  id: "c1", name: "Ahmad", phone: "60123456783", channel: "whatsapp", adId: null, ad: "WhatsApp · no ad", status: "follow_up",
  wonAmount: null, assignedTo: null, teamId: null, lastCustomerAt: null, createdAt: at("2026-10-05T13:20:00"), unread: 0,
  details: { type: "", size: "", loc: "", req: "", budget: "" }, detailsSaved: false, messages,
});
const row = (c: CrmCustomer, k: string) => infoRows(c).find(r => r.k === k)?.v;

describe("Customer info (rev 1010 §4)", () => {
  it("First contact and Last chat read dd/mm/yyyy, h:mm am — Last chat right after First contact", () => {
    const c = customer([
      { id: "m1", from: "lead", kind: "text", text: "Hi", at: at("2026-10-05T13:20:00") },
      { id: "m2", from: "me", kind: "text", text: "Hello", at: at("2026-10-06T09:05:00") },
    ]);
    expect(row(c, "First contact")).toBe("05/10/2026, 1:20 pm");
    expect(row(c, "Last chat")).toBe("06/10/2026, 9:05 am");
    expect(infoRows(c).map(r => r.k).slice(0, 3)).toEqual(["Phone", "First contact", "Last chat"]);
  });

  it("an automatic reply is not the last chat, and no conversation reads —", () => {
    const c = customer([
      { id: "m1", from: "lead", kind: "text", text: "Hi", at: at("2026-10-05T13:20:00") },
      { id: "m2", from: "me", kind: "text", text: "Thanks for reaching us", at: at("2026-10-05T13:21:00"), auto: true },
    ]);
    expect(row(c, "Last chat")).toBe("05/10/2026, 1:20 pm");
    expect(row(customer([]), "Last chat")).toBe("—");
  });
});
