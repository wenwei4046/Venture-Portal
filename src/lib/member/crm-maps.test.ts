import { describe, expect, it } from "vitest";
import { cardHasWay, mapLinks, messengerCardText, messengerVisitMessage, navLink, whatsappCardText, whatsappVisitMessage, withMapLinks, withoutMapLinks } from "./crm-maps";
import type { CrmCard } from "./crm-data";

const card: CrmCard = { kind: "Updated", start: "2026-10-09T05:00:00Z", room: "HQ", addr: "Jalan Puchong, Puchong, Selangor" };
const BASE = "https://venture-portal.example";

describe("the way to the showroom on a visit card", () => {
  it("links Google Maps and Waze to the showroom's address", () => {
    const l = mapLinks(card.addr);
    expect(l.google).toBe("https://www.google.com/maps/search/?api=1&query=Jalan%20Puchong%2C%20Puchong%2C%20Selangor");
    expect(l.waze).toBe("https://waze.com/ul?q=Jalan%20Puchong%2C%20Puchong%2C%20Selangor&navigate=yes");
  });

  it("the CRM keeps the words with both links; the words come back alone", () => {
    const words = "Your showroom visit is changed to Fri 9 Oct, 1:00 pm.\nHQ";
    const text = withMapLinks(words, card);
    expect(text).toContain("📍 Google Maps: https://www.google.com/maps/");
    expect(withoutMapLinks(text)).toBe(words);
  });

  it("WhatsApp: bold heading and labels, the office's day and time, one Google Maps button, no Waze", () => {
    const m = whatsappVisitMessage("60166199278", card);
    expect(m.interactive.type).toBe("cta_url");
    expect(m.interactive.action.parameters).toEqual({ display_text: "Google Maps", url: mapLinks(card.addr).google });
    expect(m.interactive.body.text).toBe([
      "*Your showroom visit is changed to*", "",
      "🗓️ *Date:* 9 Oct 2026 (Fri)", "⏰ *Time:* 1:00 pm", "📍 *Location:* HQ", "",
      "🔸 *Address:* Jalan Puchong, Puchong, Selangor",
    ].join("\n"));
    expect(m.interactive.body.text).not.toMatch(/waze|google\.com/i);
  });

  it("Messenger: the same layout without bold, Google Maps · Waze through our /nav.html", () => {
    expect(messengerCardText(card)).toBe(whatsappCardText(card).replace(/\*/g, ""));
    const m = messengerVisitMessage(card, BASE + "/");
    expect(m.attachment.payload.text).toBe(messengerCardText(card));
    expect(m.attachment.payload.buttons).toEqual([
      { type: "web_url", url: `${BASE}/nav.html?to=google&q=Jalan%20Puchong%2C%20Puchong%2C%20Selangor`, title: "Google Maps" },
      { type: "web_url", url: `${BASE}/nav.html?to=waze&q=Jalan%20Puchong%2C%20Puchong%2C%20Selangor`, title: "Waze" },
    ]);
    expect(navLink(BASE, "waze", " a b ")).toBe(`${BASE}/nav.html?to=waze&q=a%20b`);
  });

  it("a cancellation names the visit and invites a new booking — no address, no way there", () => {
    const t = whatsappCardText({ ...card, kind: "Cancelled" });
    expect(t.startsWith("*Your showroom visit is cancelled*")).toBe(true);
    expect(t).toContain("Reply here to book another time.");
    expect(t).not.toContain("Address");
    expect(cardHasWay({ ...card, kind: "Cancelled" })).toBe(false);
    expect(cardHasWay({ ...card, addr: " " })).toBe(false);
    expect(cardHasWay(null)).toBe(false);
  });
});
