import { describe, expect, it } from "vitest";
import { adPostUrl, parseMessengerDelivery } from "./webhook";

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
      sentAt: new Date(T).toISOString(), ad: { sourceId: "AD123", headline: "Sofa Clearance", sourceUrl: null, media: null },
    }]);
  });

  it("keeps what a customer's reply quotes (Lead View, 2026-10-27)", () => {
    const d = parseMessengerDelivery(page([{ sender: { id: "PSID1" }, recipient: { id: "PAGE1" }, timestamp: T,
      message: { mid: "m_9", text: "Queen", reply_to: { mid: "m_page" } } }]));
    expect(d.messages[0]).toMatchObject({ externalId: "m_9", body: "Queen", replyToMid: "m_page" });
  });

  it("names the ad's kind and links its post (2026-10-15)", () => {
    const ad = (x: Record<string, string>) => parseMessengerDelivery(page([{ sender: { id: "P" }, recipient: { id: "PAGE1" }, timestamp: T, message: { mid: "v", text: "hi" },
      referral: { source: "ADS", type: "OPEN_THREAD", ad_id: "AD1", ads_context_data: { ad_title: "Sofa", ...x } } }])).messages[0].ad;
    expect(ad({ video_url: "https://v", post_id: "102351059576534_88" })).toEqual({ sourceId: "AD1", headline: "Sofa", sourceUrl: "https://www.facebook.com/102351059576534/posts/88", media: "video" });
    expect(ad({ photo_url: "https://p" })).toMatchObject({ media: "image", sourceUrl: null });
    // A post id that is not one is never made a link.
    expect(ad({ post_id: "evil.com/x" })).toMatchObject({ sourceUrl: null, media: null });
  });

  it("links an ad whose post id comes alone, through its Page (2026-11-13: Customer info's Ad opened nothing)", () => {
    // As Meta sent it on 2026-11-13: the post id without its Page — every Messenger ad lead had no link.
    const d = parseMessengerDelivery({ object: "page", entry: [{ id: "107952168929283", time: 1, messaging: [{ sender: { id: "P" }, recipient: { id: "107952168929283" }, timestamp: T,
      message: { mid: "x", text: "hi", referral: { source: "ADS", type: "OPEN_THREAD", ad_id: "120254629672670085",
        ads_context_data: { ad_title: "新家3间房都要床垫？", post_id: "122209887110789684", photo_url: "https://www.facebook.com/ads/image/?d=A" } } } }] }] });
    expect(d.messages[0].ad).toEqual({ sourceId: "120254629672670085", headline: "新家3间房都要床垫？",
      sourceUrl: "https://www.facebook.com/107952168929283/posts/122209887110789684", media: "image" });
    expect(adPostUrl("122209887110789684", "107952168929283")).toBe("https://www.facebook.com/107952168929283/posts/122209887110789684");
    expect(adPostUrl("102351059576534_88", null)).toBe("https://www.facebook.com/102351059576534/posts/88");
    // A bare post id with no Page to join it to, or a Page that is not one, is no link.
    expect(adPostUrl("122209887110789684", null)).toBeNull();
    expect(adPostUrl("122209887110789684", "evil.com")).toBeNull();
    expect(adPostUrl("1/../x", "107952168929283")).toBeNull();
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
