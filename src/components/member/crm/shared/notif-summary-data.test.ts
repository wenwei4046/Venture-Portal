import { describe, expect, it } from "vitest";
import type { CrmData } from "@/lib/member/crm-data";
import { lastWordsOf, summaryFor } from "./notif-summary-data";

const data = {
  customers: [{
    id: "c1", name: "Carrie MS", phone: "60123", channel: "whatsapp", ad: "Sofa Promo", status: "follow_up", assignedTo: "s1", unread: 2,
    messages: [
      { id: "m1", from: "lead", text: "Hi", at: "2026-10-13T02:00:00Z" },
      { id: "m2", from: "me", text: "Hello!", at: "2026-10-13T02:05:00Z", by: "s1" },
      { id: "m3", from: "lead", text: "", media: { kind: "image", url: "/m/3" }, at: "2026-10-13T02:06:00Z" },
      { id: "m4", from: "lead", text: "Do you have\nthe grey one?", at: "2026-10-13T02:07:00Z" },
    ],
  }],
  visits: [{ id: "v1", customerId: "c1", showroomId: "kl", start: "2026-10-18T06:00:00Z", minutes: 60, state: "booked" }],
  rooms: [{ id: "kl", name: "Kuala Lumpur Showroom" }],
} as unknown as CrmData;

describe("a notification's summary (2026-10-14)", () => {
  it("quotes the customer's latest words for the row", () => {
    expect(lastWordsOf(data, "c1")).toBe("“Do you have the grey one?”");
    expect(lastWordsOf(data, "nobody")).toBe("");
  });
  it("names the customer, their status and owner, the next visit and the last three messages", () => {
    const go = () => {};
    const s = summaryFor({ data, nameOf: id => (id === "s1" ? "ANNA" : "—"), me: "s1" }, { title: "New enquiry for you", when: "Yesterday", customerId: "c1" }, go);
    expect(s.name).toBe("Carrie MS");
    expect(s.chan).toBe("WhatsApp · Sofa Promo");
    expect(s.facts).toEqual([["Status", "Follow up"], ["Owner", "ANNA"], ["Phone", "60123"], ["Unread", "2 messages"]]);
    expect(s.visit).toMatch(/^Visit · .* · Kuala Lumpur Showroom$/);
    expect(s.lines.map(l => [l.who, l.text])).toEqual([["You", "Hello!"], ["Carrie MS", "📷 Photo"], ["Carrie MS", "Do you have\nthe grey one?"]]);
    expect(s.openChat).toBe(go);
  });
  it("offers no chat for a customer no longer on screen", () => {
    expect(summaryFor({ data, nameOf: () => "", me: "s1" }, { title: "x", when: "y", customerId: "gone", lead: "Old" }, () => {}).openChat).toBeUndefined();
  });
});
