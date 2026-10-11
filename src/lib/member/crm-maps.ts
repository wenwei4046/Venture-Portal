/**
 * The way to the showroom, for a visit card the customer receives (design
 * handoff: a showroom's address is for Waze / Google Maps; user 2026-10-09).
 * Both channels send the same layout (`visitCardText`) — bold on WhatsApp,
 * plain on Messenger, which has no bold. WhatsApp adds Waze as its one
 * link button; Messenger adds Google Maps · Waze as two buttons that open
 * `/nav.html`, which hands the address to the app itself: Messenger opens a
 * link in its own browser, where Google Maps and Waze offered to be
 * downloaded instead of opening (user 2026-10-09). Only when the showroom has
 * an address, and never on a cancellation.
 */
import type { CrmCard } from "./crm-data";

export function mapLinks(address: string): { google: string; waze: string } {
  const q = encodeURIComponent(address.trim());
  return { google: `https://www.google.com/maps/search/?api=1&query=${q}`, waze: `https://waze.com/ul?q=${q}&navigate=yes` };
}

/** Our page that opens the app (see public/nav.html): `base` is the site the customer was sent from. */
export const navLink = (base: string, to: "google" | "waze", address: string) =>
  `${base.replace(/\/$/, "")}/nav.html?to=${to}&q=${encodeURIComponent(address.trim())}`;

/** Does this card carry the way there? */
export const cardHasWay = (card: CrmCard | null | undefined): card is CrmCard => !!card && card.kind !== "Cancelled" && !!card.addr.trim();

const MARK = "\n\n📍 Google Maps: ";

/** The card's words with the two links under them (what the CRM keeps; the channels send their own layout). */
export function withMapLinks(text: string, card: CrmCard): string {
  if (!cardHasWay(card)) return text;
  const l = mapLinks(card.addr);
  return `${text}${MARK}${l.google}\n🚗 Waze: ${l.waze}`;
}

/** The words alone. */
export const withoutMapLinks = (text: string) => text.split(MARK)[0]!;

const OFFICE_TZ = "Asia/Kuala_Lumpur";
const HEAD: Record<CrmCard["kind"], string> = {
  Confirmed: "Your showroom visit is confirmed",
  Updated: "Your showroom visit is changed to",
  Reminder: "Reminder: your showroom visit",
  Cancelled: "Your showroom visit is cancelled",
};

/**
 * A visit card as words (user 2026-10-09): the heading, a line each for date,
 * time and place, then the address — the heading and labels in bold where the
 * channel has bold (WhatsApp's *…*). Day and time are the office's; the
 * server keeps UTC.
 */
export function visitCardText(card: CrmCard, bold: boolean): string {
  const b = (s: string) => (bold ? `*${s}*` : s);
  const d = new Date(card.start);
  const part = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-GB", { timeZone: OFFICE_TZ, ...o }).format(d);
  const date = `${part({ day: "numeric", month: "short", year: "numeric" }).replace("Sept", "Sep")} (${part({ weekday: "short" })})`;
  const time = new Intl.DateTimeFormat("en-MY", { timeZone: OFFICE_TZ, hour: "numeric", minute: "2-digit", hour12: true }).format(d).toLowerCase();
  const lines = [b(HEAD[card.kind]), "", `🗓️ ${b("Date:")} ${date}`, `⏰ ${b("Time:")} ${time}`, `📍 ${b("Location:")} ${card.room}`];
  if (card.kind === "Cancelled") lines.push("", "Reply here to book another time.");
  else if (card.addr.trim()) lines.push("", `🔸 ${b("Address:")} ${card.addr.trim()}`);
  return lines.join("\n");
}

/** WhatsApp's words: bold heading and labels. */
export const whatsappCardText = (card: CrmCard) => visitCardText(card, true).slice(0, 1024);

/**
 * WhatsApp's reply with one link button (cta_url — no template, no review,
 * free inside the 24-hour window; one button only): the card's words and
 * Waze as the button (user 2026-10-11: WhatsApp links Waze; it was Google Maps since 2026-10-09).
 */
export function whatsappVisitMessage(to: string, card: CrmCard) {
  return {
    to, type: "interactive",
    interactive: {
      type: "cta_url",
      body: { text: whatsappCardText(card) },
      action: { name: "cta_url", parameters: { display_text: "Waze", url: mapLinks(card.addr).waze } },
    },
  };
}

/** Messenger's words: WhatsApp's layout without the bold (≤ 640, the button template's limit). */
export const messengerCardText = (card: CrmCard) => visitCardText(card, false).slice(0, 640);

/** Messenger's button template: the words and Google Maps · Waze, each through /nav.html on `base`. */
export function messengerVisitMessage(card: CrmCard, base: string) {
  return {
    attachment: {
      type: "template",
      payload: {
        template_type: "button",
        text: messengerCardText(card),
        buttons: [
          { type: "web_url", url: navLink(base, "google", card.addr), title: "Google Maps" },
          { type: "web_url", url: navLink(base, "waze", card.addr), title: "Waze" },
        ],
      },
    },
  };
}
