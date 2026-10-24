import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { callbackUrl, parseDelivery, safeEqual, signatureValid, verifyHandshake } from "./webhook";
import { reachableByMeta } from "./callback";

const qs = (o: Record<string, string>) => new URLSearchParams(o);

describe("the GET handshake", () => {
  it("answers the challenge when mode and token match", () => {
    expect(verifyHandshake(qs({ "hub.mode": "subscribe", "hub.verify_token": "t0k3n", "hub.challenge": "12345" }), "t0k3n"))
      .toEqual({ ok: true, challenge: "12345" });
  });

  it("refuses a wrong token, a wrong mode or a missing challenge", () => {
    expect(verifyHandshake(qs({ "hub.mode": "subscribe", "hub.verify_token": "nope", "hub.challenge": "1" }), "t0k3n")).toMatchObject({ ok: false, status: 403 });
    expect(verifyHandshake(qs({ "hub.mode": "unsubscribe", "hub.verify_token": "t0k3n", "hub.challenge": "1" }), "t0k3n")).toMatchObject({ ok: false, status: 403 });
    expect(verifyHandshake(qs({ "hub.mode": "subscribe", "hub.verify_token": "t0k3n" }), "t0k3n")).toMatchObject({ ok: false, status: 403 });
  });

  it("fails closed when no token is configured", () => {
    expect(verifyHandshake(qs({ "hub.mode": "subscribe", "hub.verify_token": "", "hub.challenge": "1" }), undefined)).toMatchObject({ ok: false, status: 503 });
  });
});

describe("the POST signature", () => {
  const secret = "app-secret-for-tests";
  const body = JSON.stringify({ entry: [] });
  const sign = (raw: string, key = secret) => "sha256=" + createHmac("sha256", key).update(raw, "utf8").digest("hex");

  it("accepts Meta's HMAC of the exact raw body", () => {
    expect(signatureValid(body, sign(body), secret)).toBe(true);
  });

  it("refuses a changed body, another key, a missing header or no secret", () => {
    expect(signatureValid(body + " ", sign(body), secret)).toBe(false);
    expect(signatureValid(body, sign(body, "other"), secret)).toBe(false);
    expect(signatureValid(body, null, secret)).toBe(false);
    expect(signatureValid(body, sign(body), undefined)).toBe(false);
  });

  it("compares in constant time and handles different lengths", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abcd")).toBe(false);
  });
});

describe("parsing a delivery", () => {
  const delivery = (value: object, field = "messages") => ({ object: "whatsapp_business_account", entry: [{ id: "WABA", changes: [{ field, value }] }] });
  const base = { messaging_product: "whatsapp", metadata: { phone_number_id: "PN1", display_phone_number: "60123456789" } };

  it("reads a text message with the customer's name and the ad they came from", () => {
    const d = parseDelivery(delivery({
      ...base,
      contacts: [{ wa_id: "60123456789", profile: { name: "Tan Mei Ling" } }],
      messages: [{ id: "wamid.1", from: "60123456789", timestamp: "1790000000", type: "text", text: { body: "Hi, price?" },
        referral: { source_type: "ad", source_id: "AD9", headline: "Akemi October Fair", source_url: "https://fb.me/x", media_type: "video" } }],
    }));
    expect(d.messages).toEqual([{
      externalId: "wamid.1", phoneNumberId: "PN1", waId: "60123456789", name: "Tan Mei Ling", kind: "text", body: "Hi, price?",
      mediaId: null, mediaMime: null, sentAt: new Date(1790000000 * 1000).toISOString(),
      ad: { sourceId: "AD9", headline: "Akemi October Fair", sourceUrl: "https://fb.me/x", media: "video" },
    }]);
  });

  it("takes a customer who uses a WhatsApp username by their BSUID when Meta sends no number", () => {
    const d = parseDelivery(delivery({
      ...base,
      contacts: [{ user_id: "MY.1052914074449222", profile: { name: "Carrie MS", username: "carriems" } }],
      messages: [{ id: "wamid.u", from_user_id: "MY.1052914074449222", timestamp: "1790000000", type: "text", text: { body: "WhatsApp testing" } }],
    }));
    expect(d.messages.map(m => [m.waId, m.name, m.body])).toEqual([["MY.1052914074449222", "Carrie MS", "WhatsApp testing"]]);
  });

  it("keeps the number when Meta sends both it and the BSUID", () => {
    const d = parseDelivery(delivery({
      ...base,
      contacts: [{ wa_id: "60123456789", user_id: "MY.1", profile: { name: "Tan" } }],
      messages: [{ id: "wamid.b", from: "60123456789", from_user_id: "MY.1", type: "text", text: { body: "Hi" } }],
    }));
    expect(d.messages.map(m => [m.waId, m.name])).toEqual([["60123456789", "Tan"]]);
  });

  it("keeps a photo or voice note as a media id to download later, with its caption", () => {
    const d = parseDelivery(delivery({ ...base, messages: [
      { id: "wamid.2", from: "601", timestamp: "1790000001", type: "image", image: { id: "MEDIA1", mime_type: "image/jpeg", caption: "My kitchen" } },
      { id: "wamid.3", from: "601", timestamp: "1790000002", type: "audio", audio: { id: "MEDIA2", mime_type: "audio/ogg", voice: true } },
    ] }));
    expect(d.messages.map(m => [m.kind, m.mediaId, m.mediaMime, m.body])).toEqual([
      ["image", "MEDIA1", "image/jpeg", "My kitchen"],
      ["audio", "MEDIA2", "audio/ogg", null],
    ]);
  });

  it("names a document by its file when it has no caption, and keeps a caption when it has one", () => {
    const d = parseDelivery(delivery({ ...base, messages: [
      { id: "wamid.4", from: "601", timestamp: "1790000003", type: "document", document: { id: "MEDIA3", mime_type: "application/pdf", filename: "DC Shoplot Proposal_ 8 Oct.pdf" } },
      { id: "wamid.5", from: "601", timestamp: "1790000004", type: "document", document: { id: "MEDIA4", mime_type: "application/pdf", filename: "quote.pdf", caption: "The quote" } },
    ] }));
    expect(d.messages.map(m => [m.kind, m.body])).toEqual([["document", "DC Shoplot Proposal_ 8 Oct.pdf"], ["document", "The quote"]]);
  });

  it("reads button replies and locations as text, and anything new as 'other'", () => {
    const d = parseDelivery(delivery({ ...base, messages: [
      { id: "a", from: "601", type: "interactive", interactive: { button_reply: { title: "Yes, Saturday" } } },
      { id: "b", from: "601", type: "location", location: { latitude: 3.1, longitude: 101.6, name: "Home" } },
      { id: "c", from: "601", type: "contacts" },
    ] }));
    expect(d.messages.map(m => [m.kind, m.body])).toEqual([["button", "Yes, Saturday"], ["location", "Home · 3.1,101.6"], ["other", null]]);
  });

  it("reads delivery statuses, with Meta's error when one failed", () => {
    const d = parseDelivery(delivery({ ...base, statuses: [
      { id: "wamid.out1", status: "delivered", timestamp: "1790000100", recipient_id: "601" },
      { id: "wamid.out2", status: "failed", timestamp: "1790000101", errors: [{ code: 131047, title: "Re-engagement message" }] },
      { id: "wamid.out3", status: "deleted" },
    ] }));
    expect(d.statuses.map(s => [s.externalId, s.status, s.error])).toEqual([
      ["wamid.out1", "delivered", null],
      ["wamid.out2", "failed", "131047 Re-engagement message"],
    ]);
  });

  it("ignores other fields and other products, and never throws on odd shapes", () => {
    expect(parseDelivery(delivery({ ...base }, "account_update")).ignored).toBe(1);
    expect(parseDelivery(delivery({ messaging_product: "instagram", metadata: { phone_number_id: "x" } })).ignored).toBe(1);
    expect(parseDelivery(null)).toEqual({ messages: [], reactions: [], statuses: [], ignored: 0 });
    expect(parseDelivery({ entry: "nope" })).toEqual({ messages: [], reactions: [], statuses: [], ignored: 0 });
    expect(parseDelivery(delivery({ ...base, messages: [{ type: "text" }] })).messages).toEqual([]); // no id / from
  });
});

describe("the Callback URL", () => {
  it("is the site's origin plus the webhook path", () => {
    expect(callbackUrl("https://venture-portal-chi.vercel.app")).toBe("https://venture-portal-chi.vercel.app/api/whatsapp/v1/webhook");
    expect(callbackUrl("https://abc.trycloudflare.com/")).toBe("https://abc.trycloudflare.com/api/whatsapp/v1/webhook");
  });
});

describe("is the URL reachable by Meta?", () => {
  it("needs https on a public host", () => {
    expect(reachableByMeta("https://abc.trycloudflare.com")).toBe(true);
    expect(reachableByMeta("https://venture-portal-chi.vercel.app")).toBe(true);
    expect(reachableByMeta("http://localhost:3000")).toBe(false);
    expect(reachableByMeta("http://example.com")).toBe(false);
    expect(reachableByMeta("https://app.localhost")).toBe(false);
  });
});
