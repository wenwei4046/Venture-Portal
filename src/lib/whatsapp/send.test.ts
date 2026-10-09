import { describe, expect, it, vi } from "vitest";
import { cleanText, sendError, sendWhatsAppText, textRequest, windowOpen } from "./send";

describe("the 24-hour window", () => {
  const now = new Date("2026-10-02T12:00:00Z");
  it("is open within 24 hours of the customer's last message, shut after", () => {
    expect(windowOpen("2026-10-02T00:00:00Z", now)).toBe(true);
    expect(windowOpen("2026-10-01T12:00:01Z", now)).toBe(true);
    expect(windowOpen("2026-10-01T12:00:00Z", now)).toBe(false);
  });
  it("is shut when the customer never wrote, or the time is not a time", () => {
    expect(windowOpen(null, now)).toBe(false);
    expect(windowOpen("nonsense", now)).toBe(false);
  });
});

describe("the text", () => {
  it("is trimmed, and refused when empty or too long", () => {
    expect(cleanText("  Hi there \r\n")).toEqual({ ok: true, text: "Hi there" });
    expect(cleanText("   ").ok).toBe(false);
    expect(cleanText("x".repeat(4097)).ok).toBe(false);
    expect(cleanText("x".repeat(4096)).ok).toBe(true);
  });
});

describe("the request", () => {
  it("is what the Cloud API expects, with the token only in the header", () => {
    const { url, init } = textRequest("PN1", "60123456789", "Hello", "TOKEN");
    expect(url).toBe("https://graph.facebook.com/v21.0/PN1/messages");
    expect(init.headers.Authorization).toBe("Bearer TOKEN");
    expect(JSON.parse(init.body)).toEqual({ messaging_product: "whatsapp", recipient_type: "individual", to: "60123456789", type: "text", text: { preview_url: false, body: "Hello" } });
    expect(url.includes("TOKEN") || init.body.includes("TOKEN")).toBe(false);
  });
});

describe("sending", () => {
  const opts = { phoneNumberId: "PN1", to: "60123", body: "Hello", token: "TOKEN" };
  const reply = (status: number, body: unknown) => vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status }));

  it("returns Meta's message id", async () => {
    expect(await sendWhatsAppText(opts, reply(200, { messages: [{ id: "wamid.ABC" }] }))).toEqual({ ok: true, wamid: "wamid.ABC" });
  });

  it("explains Meta's refusals in plain words", async () => {
    expect(await sendWhatsAppText(opts, reply(400, { error: { code: 131047 } }))).toEqual({ ok: false, error: expect.stringMatching(/24 hours/) });
    expect(await sendWhatsAppText(opts, reply(401, { error: { code: 190 } }))).toEqual({ ok: false, error: expect.stringMatching(/access token/) });
    expect(await sendWhatsAppText(opts, reply(400, { error: { code: 131026 } }))).toEqual({ ok: false, error: expect.stringMatching(/could not deliver/) });
  });

  it("never claims success without an id, and survives a network failure", async () => {
    expect((await sendWhatsAppText(opts, reply(200, {}))).ok).toBe(false);
    expect(await sendWhatsAppText(opts, vi.fn().mockRejectedValue(new Error("offline")))).toEqual({ ok: false, error: expect.stringMatching(/Could not reach/) });
  });

  it("never puts the token in an error", () => {
    for (const code of [131047, 190, 10, 131026, 1, undefined]) expect(sendError(400, { error: { code, message: "TOKEN leaked?" } })).not.toContain("TOKEN");
  });
});
