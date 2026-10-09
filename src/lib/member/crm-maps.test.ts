import { describe, expect, it } from "vitest";
import { cardHasWay, mapLinks, messengerVisitMessage, whatsappVisitMessage, withMapLinks, withoutMapLinks } from "./crm-maps";
import type { CrmCard } from "./crm-data";

const card: CrmCard = { kind: "Confirmed", start: "2026-10-09T05:00:00Z", room: "Kuala Lumpur Showroom", addr: "Jalan Puchong, Puchong, Selangor" };
const words = "Your showroom visit is confirmed for Fri 9 Oct, 1:00 pm.\nKuala Lumpur Showroom\nJalan Puchong, Puchong, Selangor";

describe("the way to the showroom on a visit card", () => {
  it("links Google Maps and Waze to the showroom's address", () => {
    const l = mapLinks(card.addr);
    expect(l.google).toBe("https://www.google.com/maps/search/?api=1&query=Jalan%20Puchong%2C%20Puchong%2C%20Selangor");
    expect(l.waze).toBe("https://waze.com/ul?q=Jalan%20Puchong%2C%20Puchong%2C%20Selangor&navigate=yes");
  });

  it("WhatsApp: the two links under the words; Messenger: the words alone with two buttons", () => {
    const text = withMapLinks(words, card);
    expect(text).toContain("📍 Google Maps: https://www.google.com/maps/");
    expect(text).toContain("🚗 Waze: https://waze.com/ul?");
    expect(withoutMapLinks(text)).toBe(words);
    const m = messengerVisitMessage(text, card);
    expect(m.attachment.payload.text).toBe(words);
    expect(m.attachment.payload.buttons.map(b => b.title)).toEqual(["Google Maps", "Waze"]);
  });

  it("no way without an address, and none on a cancellation", () => {
    expect(cardHasWay({ ...card, addr: " " })).toBe(false);
    expect(cardHasWay({ ...card, kind: "Cancelled" })).toBe(false);
    expect(withMapLinks(words, { ...card, addr: "" })).toBe(words);
    expect(cardHasWay(null)).toBe(false);
  });

  it("WhatsApp: one Google Maps button (cta_url), Waze as a link under the words", () => {
    const m = whatsappVisitMessage("60166199278", withMapLinks(words, card), card);
    expect(m.type).toBe("interactive");
    expect(m.interactive.type).toBe("cta_url");
    expect(m.interactive.action.parameters).toEqual({ display_text: "Google Maps", url: mapLinks(card.addr).google });
    expect(m.interactive.body.text).toBe(`${words}\n\n🚗 Waze: ${mapLinks(card.addr).waze}`);
    expect(m.interactive.body.text).not.toContain("google.com");
  });
});
