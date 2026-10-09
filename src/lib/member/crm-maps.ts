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

const OFFICE_TZ = "Asia/Kuala_Lumpur";
const WA_HEAD: Record<CrmCard["kind"], string> = {
  Confirmed: "Your showroom visit is confirmed",
  Updated: "Your showroom visit is changed to",
  Reminder: "Reminder: your showroom visit",
  Cancelled: "Your showroom visit is cancelled",
};

/**
 * A visit card as WhatsApp words (user 2026-10-09): the heading and each
 * label in bold (WhatsApp's *…*), a line each for date, time and place, then
 * the address. Day and time are the office's — the server keeps UTC.
 */
export function whatsappCardText(card: CrmCard): string {
  const d = new Date(card.start);
  const part = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-GB", { timeZone: OFFICE_TZ, ...o }).format(d);
  const date = `${part({ day: "numeric", month: "short", year: "numeric" }).replace("Sept", "Sep")} (${part({ weekday: "short" })})`;
  const time = new Intl.DateTimeFormat("en-MY", { timeZone: OFFICE_TZ, hour: "numeric", minute: "2-digit", hour12: true }).format(d).toLowerCase();
  const lines = [`*${WA_HEAD[card.kind]}*`, "", `🗓️ *Date:* ${date}`, `⏰ *Time:* ${time}`, `📍 *Location:* ${card.room}`];
  if (card.kind === "Cancelled") lines.push("", "Reply here to book another time.");
  else if (card.addr.trim()) lines.push("", `🔸 *Address:* ${card.addr.trim()}`);
  return lines.join("\n").slice(0, 1024);
}

/**
 * WhatsApp's reply with one link button (cta_url — no template, no review,
 * free inside the 24-hour window; one button only): the card's words and
 * Google Maps as the button (user 2026-10-09: no Waze link on WhatsApp).
 */
export function whatsappVisitMessage(to: string, card: CrmCard) {
  return {
    to, type: "interactive",
    interactive: {
      type: "cta_url",
      body: { text: whatsappCardText(card) },
      action: { name: "cta_url", parameters: { display_text: "Google Maps", url: mapLinks(card.addr).google } },
    },
  };
}
