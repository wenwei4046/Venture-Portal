import { describe, expect, it, vi } from "vitest";
import { cleanText, metaTemplateBody, metaTemplateName, sendError, sendWhatsAppText, submitWhatsAppTemplate, templateStatusOf, templateSubmitRequest, textRequest, windowOpen } from "./send";

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

describe("cold lead templates for Meta (rev 1011)", () => {
  it("writes {name} as Meta's {{1}}, with an example", () => {
    expect(metaTemplateBody(" Hi {name}, still keen? ")).toBe("Hi {{1}}, still keen?");
    expect(templateSubmitRequest({ name: "crm_x_ab", language: "en", category: "MARKETING", body: "Hi {name}" }).components)
      .toEqual([{ type: "BODY", text: "Hi {{1}}", example: { body_text: [["Sarah"]] } }]);
    expect(templateSubmitRequest({ name: "crm_x_ab", language: "en", category: "MARKETING", body: "Hello" }).components).toEqual([{ type: "BODY", text: "Hello" }]);
  });
  it("names it as Meta allows: lowercase, digits, underscores, with a tag", () => {
    expect(metaTemplateName("Follow up visit!", "AB12-cd34")).toBe("crm_follow_up_visit_ab12cd34");
    expect(metaTemplateName("出租", "x1")).toBe("crm_template_x1");
  });
  it("reads Meta's review", () => {
    expect([templateStatusOf("APPROVED"), templateStatusOf("PENDING"), templateStatusOf("REJECTED"), templateStatusOf("DISABLED"), templateStatusOf(undefined)])
      .toEqual(["approved", "review", "rejected", "rejected", "review"]);
  });
  it("submits to the account and answers Meta's id", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ id: "987", status: "PENDING", category: "MARKETING" }), { status: 200 }));
    const r = await submitWhatsAppTemplate({ wabaId: "WABA1", token: "T", name: "crm_a_b", language: "en", category: "MARKETING", body: "Hi {name}" }, fetchImpl as unknown as typeof fetch);
    expect(r).toEqual({ ok: true, id: "987", status: "review" });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain("/WABA1/message_templates");
    expect(JSON.parse(String(init.body)).components[0].text).toBe("Hi {{1}}");
  });
  it("says Meta's own reason when it refuses", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ error: { code: 100, error_user_msg: "Name already exists" } }), { status: 400 }));
    const r = await submitWhatsAppTemplate({ wabaId: "W", token: "T", name: "n", language: "en", category: "MARKETING", body: "x" }, fetchImpl as unknown as typeof fetch);
    expect(r).toEqual({ ok: false, error: "WhatsApp refused the template: Name already exists" });
  });
});
