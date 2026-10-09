import { describe, expect, it } from "vitest";
import { parseMessengerDelivery } from "./webhook";

const page = (messaging: unknown[]) => ({ object: "page", entry: [{ id: "PAGE1", time: 1, messaging }] });
const T = 1790950000000;

describe("Messenger deliveries", () => {
  it("reads a customer's text, with the ad that brought them", () => {
    const d = parseMessengerDelivery(page([{
      sender: { id: "PSID1" }, recipient: { id: "PAGE1" }, timestamp: T,
      message: { mid: "m_1", text: "Is the sofa still on sale?" },
      referral: { source: "ADS", type: "OPEN_THREAD", ad_id: "AD123", ads_context_data: { ad_title: "Sofa Clearance" } },
    }]));
    expect(d.messages).toEqual([{
      externalId: "m_1", pageId: "PAGE1", psid: "PSID1", name: null, kind: "text", body: "Is the sofa still on sale?",
      sentAt: new Date(T).toISOString(), ad: { sourceId: "AD123", headline: "Sofa Clearance", sourceUrl: null },
    }]);
  });

  it("names a photo, a sticker, a file and a button tap", () => {
    const d = parseMessengerDelivery(page([
      { sender: { id: "P" }, timestamp: T, message: { mid: "a", attachments: [{ type: "image", payload: { url: "u" } }] } },
      { sender: { id: "P" }, timestamp: T, message: { mid: "b", attachments: [{ type: "image", payload: { sticker_id: 369239263222822 } }] } },
      { sender: { id: "P" }, timestamp: T, message: { mid: "c", attachments: [{ type: "file", title: "plan.pdf" }] } },
      { sender: { id: "P" }, timestamp: T, postback: { mid: "d", title: "Book a visit" } },
    ]));
    expect(d.messages.map(m => [m.kind, m.body])).toEqual([["image", null], ["sticker", null], ["document", "plan.pdf"], ["button", "Book a visit"]]);
  });

  it("skips the Page's own messages (echoes) and anything with no customer", () => {
    const d = parseMessengerDelivery(page([
      { sender: { id: "PAGE1" }, recipient: { id: "PSID1" }, timestamp: T, message: { mid: "e", text: "Hi from us", is_echo: true } },
      { sender: { id: "PSID1" }, timestamp: T, referral: { source: "ADS", ad_id: "AD1" } },
      { timestamp: T, message: { mid: "f", text: "?" } },
    ]));
    expect([d.messages.length, d.ignored]).toEqual([0, 3]);
  });

  it("reads deliveries of our messages and the read watermark", () => {
    const d = parseMessengerDelivery(page([
      { sender: { id: "PSID1" }, timestamp: T, delivery: { mids: ["m_out1", "m_out2"] } },
      { sender: { id: "PSID1" }, timestamp: T, read: { watermark: T } },
    ]));
    expect(d.delivered).toEqual([{ externalId: "m_out1" }, { externalId: "m_out2" }]);
    expect(d.reads).toEqual([{ pageId: "PAGE1", psid: "PSID1", watermark: new Date(T).toISOString() }]);
  });

  it("ignores anything that is not a Page delivery, and never throws on shape", () => {
    for (const body of [null, 42, "x", { object: "whatsapp_business_account", entry: [] }, { object: "page" }, { object: "page", entry: [{}] }]) {
      expect(() => parseMessengerDelivery(body)).not.toThrow();
      expect(parseMessengerDelivery(body).messages).toEqual([]);
    }
  });
});
