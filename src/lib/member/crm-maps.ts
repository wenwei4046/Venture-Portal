/**
 * The way to the showroom, for a visit card the customer receives (design
 * handoff: a showroom's address is for Waze / Google Maps; user 2026-10-09:
 * the customer saw no Waze, no Google Maps). WhatsApp gets the two links
 * under the words; Messenger gets the same words with two buttons
 * (`messengerVisitMessage`). Only when the showroom has an address, and never
 * on a cancellation.
 */
import type { CrmCard } from "./crm-data";

export function mapLinks(address: string): { google: string; waze: string } {
  const q = encodeURIComponent(address.trim());
  return { google: `https://www.google.com/maps/search/?api=1&query=${q}`, waze: `https://waze.com/ul?q=${q}&navigate=yes` };
}

/** Does this card carry the way there? */
export const cardHasWay = (card: CrmCard | null | undefined): card is CrmCard => !!card && card.kind !== "Cancelled" && !!card.addr.trim();

const MARK = "\n\n📍 Google Maps: ";

/** The card's words with the two links under them (what WhatsApp sends and the CRM keeps). */
export function withMapLinks(text: string, card: CrmCard): string {
  if (!cardHasWay(card)) return text;
  const l = mapLinks(card.addr);
  return `${text}${MARK}${l.google}\n🚗 Waze: ${l.waze}`;
}

/** The words alone (Messenger shows the links as buttons instead). */
export const withoutMapLinks = (text: string) => text.split(MARK)[0]!;

/** Messenger's button template: the words (≤ 640) and Google Maps · Waze. */
export function messengerVisitMessage(text: string, card: CrmCard) {
  const l = mapLinks(card.addr);
  return {
    attachment: {
      type: "template",
      payload: {
        template_type: "button",
        text: withoutMapLinks(text).slice(0, 640),
        buttons: [
          { type: "web_url", url: l.google, title: "Google Maps" },
          { type: "web_url", url: l.waze, title: "Waze" },
        ],
      },
    },
  };
}
